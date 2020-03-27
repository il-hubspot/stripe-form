"use strict";

const request = require("request");
const crypto = require("crypto");

function md5 (input) {
  const md5 = crypto.createHash("md5");
  md5.update(input);
  return md5.digest("hex");
}

function sign (input, key) {
  const hash1 = md5(`${key}${input}${key}`);
  return md5(`${md5(key)}${hash1}${md5(key)}`);
}

function uuidv4 () {
  return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
    (c ^ crypto.randomBytes(1).readInt8() & 15 >> c / 4).toString(16)
  );
}

function requestAsync (url, opts) {
  return new Promise(function (resolve, reject) {
    request.post(url, opts || {}, function (error, response, body) {
      if (error) {
        return reject(error);
      }
      return resolve([response, body]);
    });
  });
}

exports.main = async (context, sendResponse) => {
  if (!context.body) {
    return sendResponse({body: {message: "Body is not valid JSON"}, statusCode: 400});
  }
  if (!context.body.token) {
    return sendResponse({body: {message: "token is not supplied"}, statusCode: 400});
  }
  if (!context.body.signature) {
    return sendResponse({body: {message: "signature is not supplied"}, statusCode: 400});
  }
  if (sign(context.body.token, context.secrets.STRIPE_TOKEN_KEY) !== context.body.signature) {
    return sendResponse({body: {message: "Incorrect signature"}, statusCode: 400});
  }
  let [description, amount, timestamp] = context.body.token.split("|");
  amount = parseInt(amount);
  timestamp = parseInt(timestamp);
  if (!amount || amount < 1) {
    return sendResponse({body: {message: "Invalid amount"}, statusCode: 400});
  }
  if (!timestamp) {
    return sendResponse({body: {message: "Invalid timestamp"}, statusCode: 400});
  }
  if (timestamp < (new Date()).getTime() - 1000 * 60 * 60 * 3) {
    return sendResponse({body: {message: "Expired token"}, statusCode: 400});
  }
  const descId = `${description} - ${uuidv4()}`;
  try {
    let [response, body] = await requestAsync(
      `https://${context.secrets.STRIPE_API_KEY}:@api.stripe.com/v1/payment_intents`,
      {
        form: {
          amount,
          currency: "usd",
          description: descId,
          "metadata[description]": description,
          "metadata[coupon]": couponInfo ? couponInfo.code : "",
        },
      }
    );
    try {
      body = JSON.parse(body);
    } catch (e) {
      return sendResponse({body: {message: "Failed to parse response"}, statusCode: 500});
    }
    if (response.statusCode >= 400) {
      return sendResponse({body, statusCode: 500});
    }
    sendResponse({
      body: {
        transactionId: descId,
        secret: body.client_secret,
        amount,
      },
      statusCode: 200,
    });
  } catch (e) {
    return sendResponse({body: {message: e.toString()}, statusCode: 500});
  }
};
