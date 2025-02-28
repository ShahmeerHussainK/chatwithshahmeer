
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
    console.log("Starting test-email function");
    
    // Get email address from request
    const { email } = await req.json();
    
    if (!email) {
      throw new Error("Email address is required");
    }

    console.log(`Sending test email to: ${email}`);

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

    // Creating email content
    console.log("Creating email content");
    const emailContent = `
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; }
            .container { padding: 20px; border: 1px solid #eee; border-radius: 5px; }
            h1 { color: #2b6cb0; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Test Email</h1>
            <p>This is a test email to verify that the email sending functionality is working correctly.</p>
            <p>If you received this email, the system is correctly configured.</p>
            <p>Time sent: ${new Date().toISOString()}</p>
          </div>
        </body>
      </html>
    `;

    // Send the email
    try {
      await client.send({
        from: "Backlink Bidder Hub <shahmeerhussainkhadmi@gmail.com>",
        to: email,
        subject: "Test Email from Backlink Bidder Hub",
        content: emailContent,
        html: emailContent,
      });
      console.log("Test email sent successfully");
    } catch (emailError) {
      console.error("SMTP error details:", emailError);
      throw new Error(`Failed to send email: ${emailError.message}`);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Test email sent successfully",
        recipient: email
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error in test-email function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
