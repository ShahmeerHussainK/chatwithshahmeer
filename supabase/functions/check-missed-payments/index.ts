
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
    console.log("Starting check-missed-payments function");
    
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get winners who have missed their payment deadlines
    const { data: missedPayments, error: missedPaymentsError } = await supabaseClient
      .from("auction_winners")
      .select(`
        id,
        user_id,
        auction_id,
        payment_deadline,
        auctions:auction_id (title)
      `)
      .eq("status", "pending_payment")
      .lt("payment_deadline", new Date().toISOString());

    if (missedPaymentsError) {
      console.error("Error fetching missed payments:", missedPaymentsError);
      throw new Error(`Failed to fetch missed payments: ${missedPaymentsError.message}`);
    }

    console.log(`Found ${missedPayments?.length || 0} missed payments to process`);

    if (!missedPayments || missedPayments.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "No missed payments to process" 
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    // Process each missed payment
    for (const winner of missedPayments) {
      console.log(`Processing missed payment for winner ${winner.id} (auction: ${winner.auction_id})`);
      
      // Update winner status to payment_missed
      const { error: updateError } = await supabaseClient
        .from("auction_winners")
        .update({ status: "payment_missed" })
        .eq("id", winner.id);

      if (updateError) {
        console.error(`Error updating winner ${winner.id}:`, updateError);
        continue;
      }

      // Create notification for the user
      const { error: notificationError } = await supabaseClient.rpc("create_notification", {
        p_user_id: winner.user_id,
        p_type: "payment_missed",
        p_message: `You've missed the payment deadline for auction: ${winner.auctions.title}. Your spot has been released.`
      });

      if (notificationError) {
        console.error(`Error creating notification for user ${winner.user_id}:`, notificationError);
      }

      // Find the next highest bidder (if any)
      await supabaseClient.rpc("process_missed_payments");
    }

    console.log("Missed payments processing completed");

    return new Response(
      JSON.stringify({ 
        success: true, 
        processed: missedPayments.length 
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error in check-missed-payments function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
