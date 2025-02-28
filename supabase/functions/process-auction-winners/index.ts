
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
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Find auctions that have ended but winners haven't been processed
    const { data: endedAuctions, error: auctionsError } = await supabaseClient
      .from("auctions")
      .select("id, title")
      .lt("ends_at", new Date().toISOString())
      .eq("status", "active");

    if (auctionsError) {
      throw new Error(`Error fetching ended auctions: ${auctionsError.message}`);
    }

    console.log(`Found ${endedAuctions?.length || 0} ended auctions to process`);

    const results = [];

    for (const auction of endedAuctions || []) {
      // Update auction status to "ended"
      const { error: updateError } = await supabaseClient
        .from("auctions")
        .update({ status: "ended" })
        .eq("id", auction.id);

      if (updateError) {
        console.error(`Error updating auction ${auction.id} status: ${updateError.message}`);
        results.push({
          auction_id: auction.id,
          success: false,
          error: updateError.message
        });
        continue;
      }

      // Get the winners for this auction
      const { data: winners, error: winnersError } = await supabaseClient
        .from("auction_winners")
        .select("id, user_id, winning_bid_id")
        .eq("auction_id", auction.id)
        .eq("status", "pending_payment");

      if (winnersError) {
        console.error(`Error fetching winners for auction ${auction.id}: ${winnersError.message}`);
        results.push({
          auction_id: auction.id,
          success: false,
          error: winnersError.message
        });
        continue;
      }

      console.log(`Found ${winners?.length || 0} winners for auction ${auction.id}`);

      // Send emails to all winners
      for (const winner of winners || []) {
        try {
          // Call the send-winner-email function
          const { error: emailError } = await supabaseClient.functions.invoke(
            "send-winner-email",
            {
              body: { winnerId: winner.id }
            }
          );

          if (emailError) {
            console.error(`Error sending email to winner ${winner.id}: ${emailError.message}`);
          } else {
            console.log(`Successfully sent email to winner ${winner.id}`);
          }
        } catch (emailErr) {
          console.error(`Exception sending email to winner ${winner.id}: ${emailErr.message}`);
        }
      }

      results.push({
        auction_id: auction.id,
        success: true,
        winners_count: winners?.length || 0
      });
    }

    return new Response(
      JSON.stringify({ results }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error processing auction winners:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
