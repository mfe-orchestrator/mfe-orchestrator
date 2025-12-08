import { APIRequestContext } from "@playwright/test";

// Configurazioni
export const mailinatorBaseUrl = 'https://api.mailinator.com/api/v2';
export const mailUsername = parseInt('' + Math.random() * 1000000) + 'testMail';
export const userEmail = mailUsername + '@mfeorchestrator.testinator.com';


export async function getEmailLinks(request: APIRequestContext, inboxName: string) {
  const inboxResponse = await request.get(
    `${mailinatorBaseUrl}/domains/private/inboxes/${inboxName}?token=${process.env.MAILINATOR_API_KEY}`
  );
  const inboxData = await inboxResponse.json();
  console.log('inboxData. ',inboxData)

  const messageId = inboxData.msgs[0].id;

  const messageResponse = await request.get(
    `${mailinatorBaseUrl}/domains/private/inboxes/${inboxName}/messages/${messageId}/links?token=${process.env.MAILINATOR_API_KEY}`
  );
  const messageData = await messageResponse.json();
  console.log('messageData: ',messageData, messageResponse.json())

  return messageData.links[0];
}