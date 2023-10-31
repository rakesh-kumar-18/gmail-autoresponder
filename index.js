const { google } = require("googleapis");
const { OAuth2Client } = require("google-auth-library");

// Load credentials from a JSON file
const credentials = require("./credentials.json");

const oAuth2Client = new OAuth2Client(
	credentials.web.client_id,
	credentials.web.client_secret,
	credentials.web.redirect_uris[0]
);

oAuth2Client.setCredentials({ refresh_token: credentials.web.refresh_token });

const repliedThreads = new Set();

// Define a function to process unread emails
const processEmails = async () => {
	const query = "is:unread";

	try {
		const gmail = google.gmail({ version: "v1", auth: oAuth2Client });

		// List unread messages
		const response = await gmail.users.messages.list({
			userId: "me",
			q: query,
		});

		const messages = response.data.messages;

		if (messages) {
			for (const message of messages) {
				const response = await gmail.users.messages.get({
					userId: "me",
					id: message.id,
				});

				// Extract sender email and subject from the email
				const senderEmail = response.data.payload.headers.find(
					(header) => header.name === "From"
				).value;

				const subject = response.data.payload.headers.find(
					(header) => header.name === "Subject"
				).value;

				console.log(`Received an email from ${senderEmail}`);

				if (repliedThreads.has(senderEmail)) {
					console.log(`${senderEmail} has already been replied to.`);
					continue;
				}

				const thread = await gmail.users.threads.get({
					userId: "me",
					id: message.threadId,
				});

				const replies = thread.data.messages.slice(1);

				if (replies.length === 0) {
					const emailMessage = {
						to: senderEmail,
						subject: "Re: " + subject,
						message: "I'm unavailable right now.",
					};

					// Send a reply email
					await sendEmail(gmail, emailMessage);

					const labelName = "AutoResponse";

					// Add a label to the email
					await addLabel(gmail, labelName, message.id);

					console.log("Email reply sent successfully to", senderEmail);
					repliedThreads.add(senderEmail);
				}
			}
		}
	} catch (error) {
		console.error("Error processing emails:", error);
	}
};

// Define a function to send an reply email to sender email
const sendEmail = async (gmail, emailMessage) => {
	const rawEmail = makeRawEmail(emailMessage);
	return gmail.users.messages.send({
		userId: "me",
		requestBody: { raw: rawEmail },
	});
};

// Define a function to create a new label if doesn't exist
const addLabel = async (gmail, labelName, messageId) => {
	const response = await gmail.users.labels.list({ userId: "me" });
	const labels = response.data.labels;
	const existingLabel = labels.find((label) => label.name === labelName);

	if (existingLabel) {
		return existingLabel.id;
	}

	// Create a new label
	const newLabel = await gmail.users.labels.create({
		userId: "me",
		requestBody: {
			name: labelName,
			labelListVisibility: "labelShow",
			messageListVisibility: "show",
		},
	});

	return newLabel.data.id;
};

// Convert email message to a raw email
const makeRawEmail = (emailMessage) => {
	const emailContent = [
		`To: ${emailMessage.to}`,
		`Subject: ${emailMessage.subject}`,
		"",
		emailMessage.message,
	].join("\r\n");

	const base64EncodedEmail = Buffer.from(emailContent).toString("base64");
	return base64EncodedEmail;
};

// Set an interval for processing emails
const interval = 60000;
setInterval(processEmails, interval);
