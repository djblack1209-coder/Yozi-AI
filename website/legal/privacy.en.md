Yozi AI ("Yozi", "we" or "us") is an AI study coach for students, made up of the desktop app, the mobile app and the website at yozi.bot.cd. Section 10 says who operates it.

This policy explains how we handle your personal information when we provide these services. The model provider you choose handles whatever you send it under its own privacy policy, not this one.

We handle personal information under the laws and regulations of the People's Republic of China, including the Personal Information Protection Law, the Cybersecurity Law, the Data Security Law, the Law on the Protection of Minors, the Regulations on the Protection of Minors Online, the Provisions on the Online Protection of Children's Personal Information, the Interim Measures for the Management of Generative AI Services and the Measures for Labelling AI-Generated Synthetic Content. We handle only the minimum information the features you choose need.

Text in bold matters most for your rights, so please read it carefully. Users under 14 should use Yozi only after a parent or guardian has read and accepted this policy.

## 1. What we handle and why {#collect}

1. **Sign-up and sign-in** (required)
   - Email sign-in: your email address, the email verification code, the password you set and your sign-in state. Passwords are salted and stored with a one-way method, so we never know the plain text.
   - WeChat sign-in: the account identifier WeChat provides with your authorisation, plus the nickname and avatar you agree to share.
   - Phone sign-in: unavailable until the SMS service opens; once it does, your phone number and the SMS verification code.
   - When we send a verification code, we record the time and your network address (IP) as confirmed by our trusted proxy, to stop codes being sent in bulk.
   - Purpose: to create your account, verify who you are, keep you signed in and recognise the same account across devices.
2. **Your profile and study** (required for study features)
   - What we handle: the goals, exam type, exam date and daily study time you tell us in the conversation; your answers, essay drafts and rewrites, mistakes, review schedule and results, sentence and collocation bank, summaries and conversation history.
   - Purpose: to plan daily practice and review, show weak points and progress, and let you look back.
   - These records are kept on your device by default.
3. **Cloud sync** (optional)
   - Once you explicitly turn sync on, your study records are uploaded to our servers so you can use them on your other devices.
   - **The synced copy on our servers is stored compressed. It is not end-to-end encrypted, and administrators with access can technically read it. We restrict that access with permission controls.**
   - When sign-in opens on the website, it reads only your own synced records and never changes them.
   - You can study normally on one device without sync.
4. **Material you upload** (optional)
   - What we handle: files you choose (such as PDFs and images) and the text, page images and questions extracted from them.
   - Material is parsed on your device by default (layout and text recognition). Page images or excerpts go to your chosen model provider with the current task only after you confirm each time (see section 2).
   - **A full page image may include other questions, handwriting or annotations. We do not crop page images automatically or remove image metadata. Check before you send, and select a smaller area first if you need to.**
   - Your material never enters a public question bank and is never published.
5. **AI connections** (required for AI features)
   - What we handle: the model provider, endpoint address and model you choose, and the API key you provide. Section 2, item 3 explains how keys are stored.
   - Purpose: to call that service on your instruction, read its available models live, and restore the connection when you reopen the app or sign in to the same account.
   - Checking a connection and reading its models never sends your study content.
6. **Calculation check** (optional, currently off)
   - Once available, when you explicitly ask for calculation help on a question, the current question and your answer go to our servers, where a calculation program returns a reference result.
   - No model is called and nothing goes to a third party. The result is a reference only and never changes your answer or its marking.
7. **Usage and cost records** (required for AI features)
   - What we handle: for each call, the provider, the actual model, the time, input and output usage, cost status and outcome status. We do not record your study text.
   - Purpose: to cap the number, duration and cost of each call, prevent double charges and runaway loops, and let you and us check usage.
8. **Model result recovery cache** (required for AI features)
   - What we handle: the teaching result a model returns, stored with the call it belongs to.
   - Purpose: if your connection drops, you can retrieve a finished result without calling or paying again. Section 4 sets how long it is kept.
9. **Security and operations** (required)
   - What we handle: network logs such as your network address (IP), request times and error details.
   - Purpose: to limit abuse and brute-force sign-in attempts, stop verification-code flooding and troubleshoot faults.
   - Sign-in rate limits use network addresses processed with a one-way method.

We do not collect your contacts, text messages, call history, precise location or advertising identifiers. The app has no built-in third-party analytics, advertising or crash-reporting tools. When the mobile app is published, we will list the system permissions it requests and why in this policy.

If we want to use your information for a purpose this policy does not state, we will ask for your separate consent first.

## 2. AI features and model providers {#ai}

1. **Bring your own model service (the default)**
   - Yozi's AI explanations, questions, corrections and suggestions use, by default, the account and API key you set up with a model provider yourself.
   - The provider bills your account for calls. Yozi does not handle that payment.
2. **What is sent to the model provider**
   - When it is sent: after you select a connection that has passed its check and agree to "Allow sending study content" in the app. That is your separate consent to sharing information with that provider. Until then, we send no study content.
   - Each call sends only what the current task needs: fixed teaching instructions, a short summary of your study profile, the current question or draft, and at most the six most recent messages from today. Your full history is never resent.
   - When a task needs several steps of analysis, every step uses the same connection and stays within the same consent.
   - "Inspiration" suggestions send only a summary: goals, exam, deadline, daily time, today's status, your top 5 weak points, your top 8 sentence patterns and similar items, never full drafts or feedback. You can turn them off in Settings.
   - Page images from your material are sent only after you confirm each one.
   - We never send your sign-in password or account identity details such as your email address.
   - The route: your device → Yozi's servers (for safety checks and limits on count and cost) → your chosen provider.
   - **Once content reaches the provider, it handles that content under its own privacy policy, and we cannot withdraw it for you.** Read your provider's privacy policy before you start, including whether it uses API data to train models.
3. **How your API key is stored**
   - **Your API key is encrypted with AES-GCM and stored on its own in the key vault on Yozi's servers, tied to your account. That lets the connection come back when you reopen the app or sign in on another device.**
   - **This is not end-to-end encryption: operations staff who hold the server's master deployment key can technically decrypt it. We restrict access with permission controls, and the key is used only to call the matching provider on your instruction.**
   - Keys never appear in logs, regular study exports or public install packages, and are never given to third parties.
   - You can delete a connection in the AI connector at any time, and its key record is deleted with it. Copies in operational backups expire on the schedule in section 4.
   - We suggest creating a separate key for Yozi at your provider with a spending limit, and revoking it there once you stop using it.
4. **Which services you can connect**
   - Before you connect, the app shows the provider name and endpoint address you chose. Your content goes only to the service you chose.
   - **Besides domestic providers, the AI connector in the current version also lists some providers outside mainland China and accepts custom endpoint addresses. If you choose one outside mainland China, the study content you send is transferred there and handled by that provider.** We are narrowing the available services to domestic model services that have completed their legal filings.
   - If you connect a model service running on your own computer or local network, the app sends content through the local connector straight to the service you named, without passing through Yozi's servers. Such a service may forward content to other cloud services, so check it yourself.
   - Each provider's name, contact details and privacy policy are as published on its own website.
5. **Model credits supplied by Yozi** (currently off)
   - If we later offer model credits supplied by Yozi, your task content will go to a filed provider Yozi selects, with the cost borne by Yozi and counted against your credits.
   - Before that happens, we will update this policy and publish the list of providers.
6. **Labels on AI-generated content**
   - The interface labels AI-generated explanations, corrections and suggestions, for example "AI assessment" and "AI suggestion".
   - AI feedback on writing is a study aid, not an official score.
   - We do not use your study content to train models.

## 3. Storage on your device {#local}

- The app keeps study records, drafts and recovery copies on your device, so you can view them offline and recover after a failure. They sit in your device's regular storage, and we make no extra promise of system-level encryption, so keep your device secure.
- Searching your study records happens only on your device. Search terms never go to a model or a third party.
- Study images are generated on your device and by default contain no identity details, original answers or material content. Whether to share them is up to you.
- After you sign out, the device keeps study records per account and other accounts cannot read them. Your identity, model connections and temporary credentials are cleared.
- The website stores only your language and motion preferences in your browser and sets no advertising or cross-site tracking cookies. Our network protection service (see section 4) may set security cookies needed to identify malicious traffic.

## 4. Where data is stored and for how long {#storage}

1. **Where it is stored**
   - Our servers and databases are provided by cloud providers, currently Tencent Cloud and Sealos, and are located in the People's Republic of China.
   - **Traffic to the website and our APIs passes through Cloudflare's network acceleration and protection service. Cloudflare's nodes may be outside mainland China, and traffic is decrypted at those nodes and re-encrypted before it is forwarded.**
   - Apart from that network forwarding and any model service outside mainland China that you choose yourself (see section 2, item 4), we do not provide your personal information outside mainland China.
2. **How long it is kept**

   | Information | Retention |
   | --- | --- |
   | Account information | While your account exists; after deletion, as set out in section 7, item 5 |
   | Study records on your device | On your device until you delete them, clear local data or uninstall the app |
   | Synced study records | Until you delete the cloud copy or your account |
   | Uploaded material and extracted content | Until you delete that material |
   | AI connections and keys | Until you delete the connection or your account |
   | Model result recovery cache | 24 hours by default, 7 days at most, and unrecoverable after that. For accounts left unused, expired content is cleared on the next visit |
   | Usage and cost records | While your account exists, deleted with the account; longer where laws or regulations require |
   | Server access logs (network address, request time and similar) | 15 days at most, then deleted |
   | Verification-code records, including send time and network address | 24 hours at most, then deleted automatically |
   | Security audit logs | De-identified and kept for 90 days |
   | Operational backups | Overwritten when they expire; the backup cycle will be published on this page once set |

3. Once a retention period ends, we delete or anonymise your information.
4. If the operator stops running the service, we will tell you 30 days in advance by public notice and in-app message, and delete or anonymise your personal information.

## 5. How we protect your information {#security}

- Data in transit is encrypted with HTTPS. Passwords are stored with a one-way method, and API keys are encrypted and stored separately.
- Each account's data is isolated, and access requires authentication and authorisation.
- We validate endpoint addresses and refuse unsafe targets such as internal networks. Every AI call has limits on count, duration and cost.
- We limit who can access personal information and hold them to confidentiality.
- If a personal information security incident occurs, we will tell you promptly as the law requires: what happened, its likely impact, what we have done and what you can do to protect yourself. We will also report it to the authorities as required.
- No internet environment is perfectly secure. Keep your account password and API key safe, and do not share them.

## 6. Sharing, entrusted processing, transfer and disclosure {#sharing}

1. We do not sell your personal information.
2. We provide your personal information to third parties only:
   - on your instruction, when we send the content described in section 2 to the model provider you choose;
   - with your separate consent;
   - when laws or regulations require it, or a competent authority lawfully requests it.
3. **Entrusted processing**
   - Processors and their work: Tencent Cloud and Sealos provide servers and databases; Cloudflare provides network acceleration and protection; an email delivery provider sends your verification-code emails.
   - We agree with each processor on the purpose, period, method and safeguards of processing, and we supervise their processing.
4. **Transfer**
   - If personal information has to move because of a merger, division, dissolution or bankruptcy, we will tell you the recipient's name and contact details and require the recipient to keep honouring this policy.
   - If the recipient changes the original purpose or method of processing, it must obtain your consent again.
5. **Public disclosure**: we do not publicly disclose your personal information unless laws or regulations require it.
6. **When the law does not require your consent**:
   - where it is necessary to conclude or perform a contract to which you are a party;
   - where it is necessary to perform statutory duties or obligations;
   - where it is necessary to respond to a public health emergency, or to protect a person's life, health or property in an emergency;
   - where we handle, within a reasonable scope, information you have made public or that has otherwise been lawfully made public;
   - in other circumstances set out in laws and administrative regulations.

## 7. Your rights {#rights}

You can exercise these rights in the app, or through the contact details in section 10:

1. **Access, copy and export**: view your study records in the app and export your personal study data. Exports never include API keys.
2. **Correct and complete**: edit your study profile and goals in the app. If other information is wrong, contact us to correct it.
3. **Delete**
   - Delete one piece of material: the page images, questions, conversations, answers and review records it produced are deleted with it.
   - Delete the cloud copy: your study records on our servers are deleted and your model result recovery cache on our servers is cleared, while records on your device stay. If deletion does not fully finish, the app says so and you can retry. **If sync is still on for another device, that device may upload its local copy again, so turn sync off there first.**
   - Clear local data: all accounts' study records, drafts and material on this device are cleared and cannot be recovered.
   - Delete an AI connection: its key record is deleted with it.
   - **Not covered by the above: files you have exported, local copies on other devices, content already sent to a model provider, and operational backups that have not yet expired. You need to handle the first three yourself or contact the provider concerned; operational backups are overwritten on expiry as set out in section 4.**
4. **Withdraw consent**: in Settings, turn off cloud sync, "Allow sending study content" or Inspiration suggestions. Withdrawing consent does not affect processing already carried out on the basis of it.
5. **Delete your account**
   - Request account deletion in the app's Settings. **After you request it, a 7-day cooling-off period begins, during which you can cancel. When it ends, we delete or anonymise your account, synced study records, material, AI connections and keys, usage records and recovery cache.**
   - Security audit logs are de-identified, kept for the period in section 4, item 2, and then deleted.
6. **Other rights**: you can ask us to explain our processing rules, and you can refuse or restrict a specific kind of processing.
7. **Response time and complaints**
   - Once we have verified your identity, we respond within 15 working days. Reasonable requests are normally free of charge.
   - If you believe our processing has infringed your lawful rights, you can complain to the cyberspace, education or other competent authorities, or sue in a people's court with jurisdiction.
8. **Rights of close relatives**: after a user dies, their close relatives may exercise the rights to access, copy, correct and delete the user's personal information under Article 49 of the Personal Information Protection Law, unless the user arranged otherwise while alive.

## 8. Protecting minors {#minors}

1. Yozi is made for students, so its users may include minors.
2. **Children under 14 may use Yozi only after a parent or guardian has read and accepted this policy, and only with that adult present.** We treat the personal information of children under 14 as sensitive personal information.
3. Minors aged 14 to 17 should read this policy and use the service under the guidance of a parent or guardian.
4. We handle minors' personal information only to provide study services. We do not push advertising to them or show them content unrelated to study.
5. Parents and guardians can contact us through section 10 to access, correct or delete the personal information of the minor in their care, or to delete the minor's account. If we find that we have collected a child's personal information without a guardian's consent, we will delete it as soon as possible.

## 9. Updates to this policy {#updates}

- When this policy changes, we publish the new version in the app and on the website with its update date.
- **If there is a material change, such as a new purpose, a new kind of information or a new recipient, we will tell you prominently, for example with a pop-up. Where your new consent is needed, we will not apply the new rules to your information until you give it.**

## 10. Contact us {#contact}

- Operator: the Yozi AI team. Once the operating company is registered, we will publish its full name and registered address on this page.
- Our personal information contact email is yozi@245334.xyz. Our Xiaohongshu account will be published on this page once it opens.
- Until then, you can exercise the rights in section 7 directly in the app: access, export, correction, deletion, withdrawal of consent and account deletion.
