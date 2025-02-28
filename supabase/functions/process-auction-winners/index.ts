
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Starting process-auction-winners function");
    
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get ended auctions that need winner processing
    const { data: endedAuctions, error: auctionError } = await supabaseAdmin
      .from("auctions")
      .select("id, title, max_spots, ends_at")
      .lt("ends_at", new Date().toISOString())
      .eq("winners_processed", false);

    if (auctionError) {
      console.error("Error fetching ended auctions:", auctionError);
      throw new Error(`Failed to fetch ended auctions: ${auctionError.message}`);
    }

    console.log(`Found ${endedAuctions?.length || 0} ended auctions to process`);

    if (!endedAuctions || endedAuctions.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "No ended auctions to process" 
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    // Process each ended auction
    const results = await Promise.all(
      endedAuctions.map(async (auction) => {
        console.log(`Processing auction: ${auction.id} - ${auction.title}`);
        
        try {
          // Find the top bidders for this auction
          const { data: topBids, error: bidError } = await supabaseAdmin
            .from("bids")
            .select("id, user_id, amount")
            .eq("auction_id", auction.id)
            .eq("status", "active")
            .order("amount", { ascending: false })
            .limit(auction.max_spots);

          if (bidError) {
            console.error(`Error fetching top bids for auction ${auction.id}:`, bidError);
            throw new Error(`Failed to fetch top bids: ${bidError.message}`);
          }

          console.log(`Found ${topBids?.length || 0} qualifying bids for auction ${auction.id}`);

          if (!topBids || topBids.length === 0) {
            // Mark the auction as processed even if there are no winners
            const { error: updateError } = await supabaseAdmin
              .from("auctions")
              .update({ winners_processed: true })
              .eq("id", auction.id);

            if (updateError) {
              console.error(`Error updating auction ${auction.id}:`, updateError);
            }

            return {
              auction_id: auction.id,
              success: true,
              message: "No qualifying bids found",
              winners: []
            };
          }

          // Create auction winner entries
          const winners = await Promise.all(
            topBids.map(async (bid) => {
              try {
                const { data: winner, error: winnerError } = await supabaseAdmin
                  .from("auction_winners")
                  .insert({
                    auction_id: auction.id,
                    user_id: bid.user_id,
                    winning_bid_id: bid.id,
                    payment_deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                    status: "pending_payment"
                  })
                  .select()
                  .single();

                if (winnerError) {
                  // Check if it's a duplicate key error (winner already exists)
                  if (winnerError.code === "23505") {
                    console.log(`Winner entry already exists for user ${bid.user_id} in auction ${auction.id}`);
                    return {
                      user_id: bid.user_id,
                      bid_id: bid.id,
                      success: true,
                      message: "Winner already recorded"
                    };
                  }
                  
                  console.error(`Error creating winner entry for user ${bid.user_id}:`, winnerError);
                  return {
                    user_id: bid.user_id,
                    bid_id: bid.id,
                    success: false,
                    message: `Failed to create winner entry: ${winnerError.message}`
                  };
                }

                // Send winner email notification
                console.log(`Sending winner email notification for user ${bid.user_id}`);
                try {
                  const { data: emailResult, error: emailError } = await supabaseAdmin.functions.invoke(
                    "send-winner-email",
                    {
                      body: { winnerId: winner.id }
                    }
                  );

                  if (emailError) {
                    console.error(`Error sending winner email for user ${bid.user_id}:`, emailError);
                  } else {
                    console.log(`Email sent successfully to winner ${bid.user_id}:`, emailResult);
                  }
                } catch (emailCatchError) {
                  console.error(`Exception in email sending for user ${bid.user_id}:`, emailCatchError);
                }

                // Create notification
                await supabaseAdmin.rpc("create_notification", {
                  p_user_id: bid.user_id,
                  p_type: "winner",
                  p_message: `You've won a spot in the auction: ${auction.title}. Please complete your payment within 24 hours.`
                });

                return {
                  user_id: bid.user_id,
                  bid_id: bid.id,
                  winner_id: winner.id,
                  success: true,
                  message: "Winner created successfully"
                };
              } catch (error) {
                console.error(`Error processing winner for user ${bid.user_id}:`, error);
                return {
                  user_id: bid.user_id,
                  bid_id: bid.id,
                  success: false,
                  message: `Error processing winner: ${error.message}`
                };
              }
            })
          );

          // Mark the auction as processed
          const { error: updateError } = await supabaseAdmin
            .from("auctions")
            .update({ winners_processed: true })
            .eq("id", auction.id);

          if (updateError) {
            console.error(`Error updating auction ${auction.id}:`, updateError);
          }

          return {
            auction_id: auction.id,
            success: true,
            message: `Processed ${winners.length} winners`,
            winners
          };
        } catch (error) {
          console.error(`Error processing auction ${auction.id}:`, error);
          return {
            auction_id: auction.id,
            success: false,
            message: `Error processing auction: ${error.message}`
          };
        }
      })
    );

    console.log("Auction winner processing completed");

    return new Response(
      JSON.stringify({ 
        success: true, 
        results 
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error in process-auction-winners function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
