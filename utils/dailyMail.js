const axios = require('axios');
const Sentry = require('@sentry/node');
const dotenv = require('dotenv');

dotenv.config();
let send_api = '';
if (process.env.NODE_ENV === 'production') {
  send_api = process.env.SENDGRID_API_KEY_PROD;
} else {
  send_api = process.env.SENDGRID_API_KEY_DEMO;
}

const handlebars = require('handlebars');
const fs = require('fs');
const path = require('path');

const sendEmail = async (toEmail, payLoad, subject, template) => {
  try {
    const source = fs.readFileSync(path.join(__dirname, template), 'utf8');
    const compiledTemplate = handlebars.compile(source);
    axios({
      method: 'post',
      url: 'https://api.sendgrid.com/v3/mail/send',
      headers: {
        Authorization: `Bearer ${send_api}`,
      },

      data: {
        personalizations: [
          {
            to: [
              {
                email: `${toEmail}`,
              },
            ],
            subject: `${subject}`,
          },
        ],
        from: {
          // email: 'jim@auxpay.net',
          email: 'reports@auxvault.net',
        },
        // content:[ compiledTemplate(payLoad)]
        content: [{ type: 'text/html', value: compiledTemplate(payLoad) }],
      },
    });
  } catch (err) {
    Sentry.captureException(err);
    console.log(err);
  }
};

const dailyEmail = async (toEmail, payLoad, subject, template) => {
  try {
    const source = fs.readFileSync(path.join(__dirname, template), 'utf8');
    const compiledTemplate = handlebars.compile(source);
    axios({
      method: 'post',
      url: 'https://api.sendgrid.com/v3/mail/send',
      headers: {
        Authorization: `Bearer ${send_api}`,
      },

      data: {
        personalizations: [
          {
            to: [
              {
                email: `${toEmail}`,
              },
            ],
            subject: `${subject}`,
          },
        ],
        from: {
          // email: 'jim@auxpay.net',
           email: 'reports@auxvault.net'          
        },
        // content:[ compiledTemplate(payLoad)]
        content: [{ type: 'text/html', value: compiledTemplate(payLoad) }],
      },
    });
  } catch (err) {
    Sentry.captureException(err);
    console.log(err);
  }
};

module.exports = sendEmail;
module.exports = dailyEmail;