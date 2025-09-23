// Download the helper library from https://www.twilio.com/docs/node/install
import twilio from "twilio"; // Or, for ESM: import twilio from "twilio";

// Find your Account SID and Auth Token at twilio.com/console
// and set the environment variables. See http://twil.io/secure
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

export async function sendOTP(phone) {
  await client.verify.v2.services("VA5f42911d02b275e15c6a82a2d4ba966b")
      .verifications
      .create({to: `+52${phone}`, channel: 'sms'})
      .then(verification => console.log(verification.sid));
}

export async function verifyOTP(phone, code, next) {
    try {
      const verification_check = await client.verify.v2
        .services("VA5f42911d02b275e15c6a82a2d4ba966b")
        .verificationChecks
        .create({ to: `+52${phone}`, code });

      if (verification_check.status === "approved") {
        return { success: true};
      } else {
        return { success: false};
      }
    } catch (err) {
      return { success: false };
    }
}