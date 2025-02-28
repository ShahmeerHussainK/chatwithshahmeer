
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { SMTPClient } from "https://deno.land/x/smtp@v0.7.0/mod.ts";

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
    console.log("Starting send-winner-email function");
    
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get request body
    const requestBody = await req.json();
    console.log("Request body:", JSON.stringify(requestBody));
    
    const { winnerId } = requestBody;
    
    if (!winnerId) {
      throw new Error("Winner ID is required");
    }

    console.log(`Processing winner ID: ${winnerId}`);

    // Get the winner details with related information
    const { data: winner, error: winnerError } = await supabaseClient
      .from("auction_winners")
      .select(`
        id,
        user_id,
        auction_id,
        winning_bid_id,
        payment_deadline,
        auctions:auction_id (
          title
        ),
        profiles:user_id (
          email,
          username
        ),
        bids:winning_bid_id (
          amount
        )
      `)
      .eq("id", winnerId)
      .single();

    if (winnerError || !winner) {
      console.error("Winner fetch error:", winnerError);
      throw new Error(`Winner not found: ${winnerError?.message || "No data returned"}`);
    }

    console.log(`Found winner: ${JSON.stringify(winner)}`);
    
    if (!winner.profiles?.email) {
      throw new Error("Winner has no email address");
    }

    // Configure email client with your Google credentials
    console.log("Setting up SMTP client");
    const client = new SMTPClient({
      connection: {
        hostname: "smtp.gmail.com",
        port: 465,
        tls: true,
        auth: {
          username: "shahmeerhussainkhadmi@gmail.com",
          password: "jujo bkef beao ahms",
        },
      },
    });

    // Create payment link for the winner
    console.log("Creating checkout session");
    const { data: sessionData, error: sessionError } = await supabaseClient.functions.invoke(
      "create-checkout-session",
      {
        body: {
          bidId: winner.winning_bid_id,
        },
      }
    );

    if (sessionError) {
      console.error("Checkout session error:", sessionError);
      throw new Error(`Failed to create payment session: ${sessionError.message}`);
    }

    if (!sessionData?.sessionUrl) {
      console.error("No session URL returned:", sessionData);
      throw new Error("No payment URL returned from checkout session");
    }

    const paymentUrl = sessionData.sessionUrl;
    console.log(`Created payment URL: ${paymentUrl}`);
    
    const deadlineDate = new Date(winner.payment_deadline);
    const formattedDeadline = deadlineDate.toLocaleString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    // Creating email content
    console.log("Creating email content");
    const emailContent = `
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; }
            .container { padding: 20px; border: 1px solid #eee; border-radius: 5px; }
            h1 { color: #2b6cb0; }
            .button { display: inline-block; background-color: #3182ce; color: white; padding: 12px 24px; text-decoration: none; 
                      border-radius: 4px; font-weight: bold; margin: 20px 0; }
            .warning { color: #e53e3e; font-weight: bold; }
            .footer { font-size: 12px; color: #718096; margin-top: 30px; border-top: 1px solid #eee; padding-top: 10px; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Congratulations! You've Won a Spot in "${winner.auctions.title}"</h1>
            <p>Great news! You've successfully secured a spot in the auction with your bid of $${winner.bids.amount}.</p>
            
            <p><strong>Important:</strong> You must complete your payment within 24 hours (by ${formattedDeadline}) to secure your spot.</p>
            
            <p class="warning">If you don't complete your payment within this timeframe, your spot may be given to the next highest bidder.</p>
            
            <a href="${paymentUrl}" class="button">Complete Your Payment Now</a>
            
            <p>If you have any questions or issues with the payment process, please contact us immediately.</p>
            
            <div class="footer">
              <p>This is an automated email. Please do not reply to this message.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    // Send the email
    console.log(`Attempting to send email to: ${winner.profiles.email}`);
    
    try {
      await client.send({
        from: "Backlink Bidder Hub <shahmeerhussainkhadmi@gmail.com>",
        to: winner.profiles.email,
        subject: `Action Required: Complete Your Payment for ${winner.auctions.title}`,
        content: emailContent,
        html: emailContent,
      });
      console.log("Email sent successfully");
    } catch (emailError) {
      console.error("SMTP error details:", emailError);
      throw new Error(`Failed to send email: ${emailError.message}`);
    }

    // Create a notification in the database
    console.log("Creating notification in database");
    await supabaseClient.rpc("create_notification", {
      p_user_id: winner.user_id,
      p_type: "auction_win",
      p_message: `You've won a spot in the auction: ${winner.auctions.title}. Please complete your payment by ${formattedDeadline}.`
    });

    console.log(`Process completed successfully for winner: ${winner.profiles.email}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Winner notification email sent successfully",
        recipient: winner.profiles.email
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error in send-winner-email function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
