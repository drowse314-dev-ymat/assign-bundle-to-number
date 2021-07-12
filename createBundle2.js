require("dotenv").config();
const rq = require("request-promise");
const fs = require("fs");

const ACCOUNT_SID = process.env.ACCOUNT_SID;
const AUTH_TOKEN = process.env.AUTH_TOKEN;
const NUMBER_TYPE = process.env.NUMBER_TYPE;
const BUSINESS_NAME = process.env.BUSINESS_NAME;
const BUSINESS_DESCRIPTION = process.env.BUSINESS_DESCRIPTION;
const BUSINESS_ADDRESS = process.env.BUSINESS_ADDRESS;
const BUSINESS_CITY = process.env.BUSINESS_CITY;
const BUSINESS_REGION = process.env.BUSINESS_REGION;
const BUSINESS_POSTAL_CODE = process.env.BUSINESS_POSTAL_CODE;
const BUSINESS_ISO_COUNTRY = process.env.BUSINESS_ISO_COUNTRY;
const CORPORATE_REGISTRY_FILE = process.env.CORPORATE_REGISTRY_FILE;
const POWER_OF_ATTORNEY_FILE = process.env.POWER_OF_ATTORNEY_FILE || "";
const FIRST_NAME = process.env.FIRST_NAME;
const LAST_NAME = process.env.LAST_NAME;
const BIRTH_DATE = process.env.BIRTH_DATE;
const STREET = process.env.STREET;
const CITY = process.env.CITY;
const REGION = process.env.REGION;
const POSTAL_CODE = process.env.POSTAL_CODE;
const ISO_COUNTRY = process.env.ISO_COUNTRY;
const DRIVERS_LICENSE_FILE = process.env.DRIVERS_LICENSE_FILE;
const EMAIL = process.env.EMAIL;

const now = new Date();

const client = require("twilio")(ACCOUNT_SID, AUTH_TOKEN);

// サブアカウントをクロール
client.api.accounts
  .list({ limit: 100 })
  .then(async (accounts) => {
    for (account of accounts) {
      await execSubAccount(account);
    }
  })
  .catch((err) => {
    console.error(`*** ERROR ***\n${err}`);
  });

const execSubAccount = async (account) => {
  console.log(`${account.friendlyName} [${account.sid}]==============`);
  const twilioClient = require("twilio")(account.sid, account.authToken);

  // すでに登録済みのBundlesを確認
  await twilioClient.numbers.regulatoryCompliance.bundles
    .list({ limit: 100 })
    .then(async (bundles) => {
      let fNoBundles = true;
      bundles.forEach((bundle) => {
        console.log(`${bundle.sid} => ${bundle.status}`);
        if (bundle.status === "twilio-approved") fNoBundles = false;
      });
      if (fNoBundles) await addBundles(twilioClient);
    })
    .catch((err) => {
      console.error(`*** ERROR ***\n${err}`);
    });
};

const addBundles = async (twilioClient) => {
  let bundleSid = null; // BUxxxxxx
  let addressSid = null; // ADxxxxxx
  let businessAddressSid = null; // ADxxxxxx
  let userSid = null; // ITxxxxxx
  let corporateRegistrySid = null; // RDxxxxxx
  let powerOfAttorneySid = null; // RDxxxxxx
  let driversLicenseSid = null; // RDxxxxxx
  let itemAssignment = null; // BVxxxxxxx
  let formData, options, body;

  try {
    // Create business address
    const businessAddress = await twilioClient.addresses.create({
      customerName: `${BUSINESS_NAME}`,
      friendlyName: `${BUSINESS_NAME}`,
      street: `${BUSINESS_ADDRESS}`,
      city: BUSINESS_CITY,
      region: BUSINESS_REGION,
      postalCode: BUSINESS_POSTAL_CODE,
      isoCountry: BUSINESS_ISO_COUNTRY,
    });
    console.log(`🐞 Business Address created. ${businessAddress.sid}`);
    businessAddressSid = businessAddress.sid;

    // Create user address
    const userAddress = await twilioClient.addresses.create({
      customerName: `${LAST_NAME} ${FIRST_NAME}`,
      friendlyName: `${LAST_NAME} ${FIRST_NAME}`,
      street: STREET,
      city: CITY,
      region: REGION,
      postalCode: POSTAL_CODE,
      isoCountry: ISO_COUNTRY,
    });
    console.log(`🐞 User Address created. ${userAddress.sid}`);
    addressSid = userAddress.sid;

    // Create new Bundle
    const bundle =
      await twilioClient.numbers.regulatoryCompliance.bundles.create({
        endUserType: "business",
        isoCountry: ISO_COUNTRY,
        numberType: "national",
        friendlyName: BUSINESS_NAME,
        email: EMAIL,
      });
    console.log(`🐞 Bundle created. ${bundle.sid}`);
    bundleSid = bundle.sid;

    // Create End-User
    const endUser =
      await twilioClient.numbers.regulatoryCompliance.endUsers.create({
        attributes: {
          business_description: BUSINESS_DESCRIPTION,
          business_name: BUSINESS_NAME,
          birth_date: BIRTH_DATE,
          first_name: FIRST_NAME,
          last_name: LAST_NAME,
        },
        friendlyName: `Business End User at ${now}`,
        type: "business",
      });
    console.log(`🐞 End-User created. ${endUser.sid}`);
    userSid = endUser.sid;

    // Create a Supporting Document with file upload（Corporate Registry）
    formData = {
      Type: "corporate_registry",
      MimeType: "application/pdf",
      Attributes: JSON.stringify({
        address_sids: [businessAddressSid],
        first_name: FIRST_NAME,
        last_name: LAST_NAME,
        business_name: BUSINESS_NAME,
        business_description: BUSINESS_DESCRIPTION,
      }),
      FriendlyName: `Corporate Registry at ${now}`,
      File: fs.createReadStream(`./images/${CORPORATE_REGISTRY_FILE}`),
    };
    options = {
      url: "https://numbers-upload.twilio.com/v2/RegulatoryCompliance/SupportingDocuments",
      method: "POST",
      auth: {
        user: account.sid,
        password: account.authToken,
      },
      formData: formData,
    };
    body = await rq(options);
    corporateRegistrySid = JSON.parse(body).sid;
    console.log(
      `🐞 Corporate Registry Document uploaded. ${corporateRegistrySid}`
    );

    // Create a Supporting Document with file upload (Power of Attorney)
    if (POWER_OF_ATTORNEY_FILE.length !== 0) {
      formData = {
        Type: "power_of_attorney",
        MimeType: "application/pdf",
        Attributes: JSON.stringify({
          address_sids: [businessAddressSid, addressSid],
          first_name: FIRST_NAME,
          last_name: LAST_NAME,
        }),
        FriendlyName: `Power Of Attorney at ${now}`,
        File: fs.createReadStream(`./images/${POWER_OF_ATTORNEY_FILE}`),
      };
      options = {
        url: "https://numbers-upload.twilio.com/v2/RegulatoryCompliance/SupportingDocuments",
        method: "POST",
        auth: {
          user: account.sid,
          password: account.authToken,
        },
        formData: formData,
      };
      body = await rq(options);
      powerOfAttorneySid = JSON.parse(body).sid;
      console.log(
        `🐞 Power of Attorney Document uploaded. ${powerOfAttorneySid}`
      );
    }

    // Create a Supporting Document with file upload (Driving License)
    formData = {
      Type: "drivers_license",
      MimeType: "image/jpeg",
      Attributes: JSON.stringify({
        address_sids: [addressSid],
        birth_date: BIRTH_DATE,
        first_name: FIRST_NAME,
        last_name: LAST_NAME,
      }),
      FriendlyName: `Driver's License at ${now}`,
      File: fs.createReadStream(`./images/${DRIVERS_LICENSE_FILE}`),
    };
    options = {
      url: "https://numbers-upload.twilio.com/v2/RegulatoryCompliance/SupportingDocuments",
      method: "POST",
      auth: {
        user: account.sid,
        password: account.authToken,
      },
      formData: formData,
    };
    body = await rq(options);
    driversLicenseSid = JSON.parse(body).sid;
    console.log(`🐞 Drivers License Document uploaded. ${driversLicenseSid}`);

    // Assign End-User to a Regulatory Bundle
    itemAssignment = await twilioClient.numbers.regulatoryCompliance
      .bundles(bundleSid)
      .itemAssignments.create({
        objectSid: userSid,
      });
    console.log(`🐞 Item assigned. ${itemAssignment.sid}`);

    // Assign corporate document to a Regulatory Bundle
    itemAssignment = await twilioClient.numbers.regulatoryCompliance
      .bundles(bundleSid)
      .itemAssignments.create({
        objectSid: corporateRegistrySid,
      });
    console.log(`🐞 Item assigned. ${itemAssignment.sid}`);

    // Assign power of Attorney document to Regulatory Bundle
    if (POWER_OF_ATTORNEY_FILE.length !== 0) {
      itemAssignment = await twilioClient.numbers.regulatoryCompliance
        .bundles(bundleSid)
        .itemAssignments.create({
          objectSid: powerOfAttorneySid,
        });
      console.log(`🐞 Item assigned. ${itemAssignment.sid}`);
    }

    // Assign user document to a Regulatory Bundle
    itemAssignment = await twilioClient.numbers.regulatoryCompliance
      .bundles(bundleSid)
      .itemAssignments.create({
        objectSid: driversLicenseSid,
      });
    console.log(`🐞 Item assigned. ${itemAssignment.sid}`);

    // Request a Regulatory Bundle
    const bundleRequest = await twilioClient.numbers.regulatoryCompliance
      .bundles(bundleSid)
      .update({
        friendlyName: `Request at ${now}`,
        status: "pending-review",
      });
    console.log(`🐞 Bundle requested. ${bundleRequest.sid}`);
  } catch (err) {
    console.error(`👺 ERROR: ${err}`);
  }
};
