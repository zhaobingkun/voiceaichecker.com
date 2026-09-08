#!/usr/bin/env python3
from __future__ import annotations

import html
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
BASE_URL = "https://voiceaichecker.com"
UPDATED = "2026-09-09"


PAGES = [
    {
        "slug": "how-to-detect-ai-voice",
        "title": "How to Detect AI Voice: A Practical Verification Method",
        "description": "Learn how to detect AI voice with a repeatable workflow: check the source, prepare a clean sample, run detection, and verify independently.",
        "eyebrow": "Detection method",
        "h1": "How to Detect AI Voice",
        "summary": "Do not decide from one odd syllable. Use a clean speech sample, combine detector evidence with source checks, and verify the speaker through a separate channel.",
        "image": "/assets/voice-detection-hero.webp",
        "image_alt": "AI voice detection workflow showing a waveform and review signals",
        "direct": "The most reliable practical method is a four-step review: preserve the original source, isolate 10 to 30 seconds of one speaker, run an AI voice check, then verify the identity and claim outside the audio itself.",
        "sections": [
            ("1. Preserve the original source", [
                "Start before editing the file. Keep the original message, post URL, account name, timestamp, and any surrounding conversation. A forwarded clip can lose useful context, while a screen recording or re-export may add compression that changes how the voice sounds. If the clip matters to a payment, access request, news claim, or workplace decision, record where it came from before you test anything.",
                "Source context can be stronger than audio intuition. A familiar voice arriving from a new account, an unexpected number, or an unverified social profile deserves caution even when the speech sounds natural. Conversely, a compressed recording from a known platform can sound metallic without being generated. Detection should begin with provenance, not with a hunt for a single magic sound."
            ]),
            ("2. Prepare a useful speech sample", [
                "Choose a section with one speaker, steady volume, and as little music or crowd noise as possible. Ten to thirty seconds is usually enough to capture pacing, transitions, consonants, and pauses without mixing several recording conditions. Avoid introductions, hold music, long silence, overlapping voices, or a clip that has been played through another phone speaker.",
                "If the original file is long, test the passage connected to the claim you need to verify. For a suspicious voicemail, use the request itself. For a video, use the clean narration rather than the soundtrack. If the first section is unclear, select a second independent section instead of repeatedly testing the same noisy segment."
            ]),
            ("3. Run detection and read the result", [
                "Upload or record the selected sample with the AI Voice Detector. The result is a probability-style screening signal, not a declaration of authenticity. A likely AI result means the sample deserves stronger verification. An unclear result means the audio does not support a confident direction. A likely human result does not prove that the speaker, account, or request is legitimate.",
                "Keep the result tied to the exact sample. Do not describe an entire interview as fake because one compressed excerpt scored high. For important reviews, note which seconds were checked and compare another clean segment. Consistent direction across separate samples is more useful than repeatedly trimming one borderline passage until the label changes."
            ]),
            ("4. Verify outside the audio", [
                "Use a trusted contact method that existed before the suspicious message. Call a known number, open the person's verified profile, ask for a live response, or check whether the original publisher released the same recording. For financial or account requests, confirm the action through the organization's normal process rather than replying in the same thread.",
                "The final decision should combine the detector signal, source history, request context, and independent confirmation. This is especially important for money transfers, password resets, employment instructions, public accusations, and safety issues. The detector helps prioritize review; it does not replace identity verification or factual investigation."
            ]),
        ],
        "cards_title": "AI voice review checklist",
        "cards": [
            ("Source", "Keep the original URL, sender, timestamp, and unedited file."),
            ("Sample", "Use 10 to 30 seconds of clear speech from one speaker."),
            ("Signal", "Treat likely AI, unclear, and likely human as review bands."),
            ("Confirmation", "Verify the person and request through a trusted channel."),
        ],
        "faq": [
            ("Can I detect AI voice by listening only?", "Listening can identify reasons to investigate, but it is unreliable on its own. Compression, editing, accents, illness, and microphones can make human speech sound synthetic."),
            ("How long should the sample be?", "Use about 10 to 30 seconds of clear speech from one speaker. Very short or mixed clips are more likely to be unclear."),
            ("Does a likely human result prove the call is safe?", "No. A real person can still make a fraudulent request, and a generated clip can evade detection. Verify the sender and requested action separately."),
            ("Should I test multiple sections?", "For an important decision, test two or three clean, non-overlapping sections and keep each result tied to its exact timestamp."),
        ],
        "cta": ("Run a voice check", "/"),
    },
    {
        "slug": "signs-of-ai-generated-voice",
        "title": "Signs of an AI-Generated Voice: What to Check",
        "description": "Review common signs of an AI-generated voice, recording artifacts that cause false alarms, and the checks to make before trusting a clip.",
        "eyebrow": "Listening guide",
        "h1": "Signs of an AI-Generated Voice",
        "summary": "Synthetic speech may show timing, texture, or transition problems, but none of these signs proves a clip is AI. Use them to select samples and decide what to verify next.",
        "image": "/assets/voice-detection-result.webp",
        "image_alt": "AI voice detector result with human and synthetic signal bands",
        "direct": "Possible signs include unusually even pacing, unstable voice texture, awkward breaths, clipped word transitions, and emotion that does not match emphasis. The same effects can also come from compression or editing, so confirm with a detector and source review.",
        "sections": [
            ("Timing and rhythm clues", [
                "Listen for pauses that arrive at unnatural grammatical points, words that run together without normal preparation, or pacing that stays mechanically even through a long sentence. Some generated voices place emphasis correctly at the start and then flatten toward the end. Others sound polished word by word but do not carry a natural thought across the whole phrase.",
                "Timing is not proof. Scripted presenters, accessibility tools, non-native speakers, tired speakers, and aggressive editing can all change rhythm. A useful review compares several sentences and asks whether the pattern is consistent, rather than treating one unusual pause as a verdict."
            ]),
            ("Voice texture and transitions", [
                "Pay attention to changes around consonants, breaths, laughter, whispered words, and quick shifts in pitch. A cloned or generated voice may briefly lose texture, become too smooth, or change room tone between words. Names, numbers, and rare terms can expose transitions because the system has less predictable context to work with.",
                "Platform processing can produce the same symptoms. Noise removal may erase breaths, a low-bitrate message may smear consonants, and speakerphone playback may add a hollow or metallic quality. Try to obtain the original file before concluding that a texture problem came from generation."
            ]),
            ("Emotion and message context", [
                "A voice can sound emotional and still be synthetic. Modern cloned speech can imitate urgency, calmness, anger, or distress. Look for whether emphasis follows the meaning of the sentence and whether the speaker reacts naturally to changing context. In an interactive call, delayed or generic responses may matter more than a polished opening statement.",
                "The request itself is often the strongest warning. Unexpected secrecy, pressure to act immediately, a new payment destination, refusal to switch channels, or a claim that normal verification is impossible should trigger a pause. Those behaviors are risky whether the voice is generated or human."
            ]),
            ("Turn signs into a verification plan", [
                "Mark the cleanest suspicious section and test it, then compare the result with the source. Search for the original upload, check the account history, and see whether trusted channels carry the same statement. If the clip imitates someone you know, contact that person through a number or account you already trust.",
                "Describe findings precisely. Say that a selected segment shows possible synthetic signals, not that a person definitely created a fake. Preserve uncertainty when the sample is short, edited, noisy, or near the middle of the detector range. That language prevents a screening result from becoming an unsupported accusation."
            ]),
        ],
        "cards_title": "What common signs can mean",
        "cards": [
            ("Flat pacing", "Possible synthesis, but also scripting, fatigue, or careful narration."),
            ("Missing breaths", "Possible generation, but also noise removal or tight editing."),
            ("Metallic texture", "Possible processing artifact, often caused by low-bitrate audio."),
            ("Urgent request", "A fraud warning regardless of whether the voice is AI or human."),
        ],
        "faq": [
            ("What is the clearest sign of an AI voice?", "There is no single definitive sign. Repeated timing, texture, and transition problems across clean speech are more useful than one odd word."),
            ("Can AI voices breathe or sound emotional?", "Yes. Generated voices can include breaths and emotional delivery, so their presence does not prove a voice is human."),
            ("Why does a real voice sometimes sound robotic?", "Compression, denoising, poor microphones, phone networks, scripted delivery, illness, and re-recording can all change natural speech."),
            ("What should I do after noticing several signs?", "Preserve the source, test a clean sample, and verify the speaker or publisher through an independent trusted channel."),
        ],
        "cta": ("Check a suspicious sample", "/is-this-voice-ai/"),
    },
    {
        "slug": "how-to-detect-cloned-voice",
        "title": "How to Detect a Cloned Voice and Verify the Speaker",
        "description": "Learn how to detect a cloned voice, respond to impersonation attempts, verify the real speaker, and preserve evidence without overclaiming.",
        "eyebrow": "Clone verification",
        "h1": "How to Detect a Cloned Voice",
        "summary": "A cloned voice is an identity problem as well as an audio problem. Screen the speech, then confirm the person and request through a channel the caller cannot control.",
        "image": "/assets/voice-detection-hero.webp",
        "image_alt": "Waveform used to review a suspected cloned voice",
        "direct": "To check a suspected cloned voice, save the original message, isolate the imitated speaker, run a clone signal check, and contact the real person through a previously trusted number or account before acting.",
        "sections": [
            ("Separate voice cloning from speaker identity", [
                "A voice clone detector screens one recording for synthetic speech signals. It does not compare two voices, identify a person, or prove who made the file. Someone can use a real recording out of context, splice human speech, or play audio from another source without generating a clone. Treat the technical result and the identity question as separate parts of the review.",
                "Start with the behavior around the clip. A familiar voice using an unfamiliar number, requesting secrecy, changing payment details, or avoiding a live conversation is suspicious even if the recording sounds natural. The safest response is to pause the requested action while you verify the person."
            ]),
            ("Collect a clean clone sample", [
                "Use the passage where the suspected person speaks alone. Avoid the caller's introduction, background music, another speaker, or a replay through a loudspeaker. If the message repeats the same phrase, keep the original file rather than recording it again. Re-recording adds room echo and device processing that can confuse both human listeners and automated checks.",
                "For a live call, do not keep the suspected caller engaged just to collect more audio if doing so creates risk. End the call, preserve the number and time, and use a trusted callback route. A short voicemail or message can be tested later without complying with the request."
            ]),
            ("Use an independent verification challenge", [
                "Call the person on a number already saved in your contacts, open an existing verified account, or contact a mutual trusted person. Do not use a callback number supplied in the suspicious message. For workplaces, follow the normal approval path for payments, credentials, HR changes, and urgent executive requests.",
                "A private question can help, but avoid relying on information that may be public, leaked, or visible on social media. A live interaction tied to a current situation is stronger than a static secret. Organizations should use agreed verification procedures rather than inventing a new challenge during an incident."
            ]),
            ("Document the result without accusing", [
                "Record the source, tested timestamp, detector direction, and independent verification outcome. If the score is unclear, say so. If the score is likely AI, describe it as a screening signal that justified escalation. Do not publish a person's name with a fraud allegation based only on a detector result.",
                "Report confirmed impersonation through the relevant platform, bank, employer, or law-enforcement channel when appropriate. Keep the original file and conversation intact. Screenshots and exported copies are useful, but they should supplement rather than replace the original evidence."
            ]),
        ],
        "cards_title": "Clone-response sequence",
        "cards": [
            ("Pause", "Do not pay, share a code, or change access while identity is uncertain."),
            ("Preserve", "Keep the original audio, sender details, time, and requested action."),
            ("Screen", "Test one clean segment for AI or cloned voice signals."),
            ("Verify", "Contact the real person through a trusted route you already had."),
        ],
        "faq": [
            ("Can a clone detector confirm who is speaking?", "No. It screens for synthetic speech signals and does not perform speaker identification or voice matching."),
            ("What if the cloned voice knows personal details?", "Personal details may be public, stolen, or gathered from social media. Verify through a trusted channel and do not treat knowledge alone as identity proof."),
            ("Should I challenge a suspicious caller?", "It is usually safer to end the interaction and contact the person or organization through a known route, especially when money or account access is involved."),
            ("Can a likely human score rule out impersonation?", "No. The clip may be a replay, edit, or real person acting fraudulently. Identity verification remains necessary."),
        ],
        "cta": ("Open the clone detector", "/voice-clone-detector/"),
    },
    {
        "slug": "ai-voice-detection-accuracy",
        "title": "AI Voice Detection Accuracy: How to Interpret Results",
        "description": "Understand AI voice detection accuracy, confidence bands, false positives, false negatives, sample quality, and when human verification is required.",
        "eyebrow": "Accuracy guide",
        "h1": "AI Voice Detection Accuracy",
        "summary": "Accuracy depends on the model, audio source, generator, compression, language, and decision threshold. A score is evidence for review, not a universal truth percentage.",
        "image": "/assets/voice-detection-result.webp",
        "image_alt": "AI voice detection result showing probability and confidence",
        "direct": "No detector has one accuracy number that applies to every clip. Interpret the result using sample quality, score band, known failure modes, and independent source verification.",
        "sections": [
            ("Why one accuracy percentage is misleading", [
                "Published benchmark performance depends on which human recordings, generators, languages, microphones, and attacks were included. Real-world clips may be shorter, noisier, more compressed, or created by newer systems than the evaluation set. A detector that performs well on one benchmark can behave differently on a messaging app voice note or a re-recorded phone call.",
                "The prevalence of synthetic audio also changes how results should be read. In a collection where fake clips are rare, even a low false-positive rate can produce several false alarms. In a targeted fraud queue, the same detector may be more useful because suspicious cases are already enriched by context."
            ]),
            ("Score bands are not accuracy claims", [
                "Voice AI Checker displays results in three practical bands: scores at or below 0.30 are labeled likely human, scores from 0.30 to 0.70 are unclear, and scores at or above 0.70 are labeled likely AI. These thresholds organize the interface. They do not mean that a 0.80 score guarantees an 80 percent chance that every related claim is fake.",
                "The middle band is intentionally broad because borderline evidence should not be forced into a binary answer. If a high-stakes clip is unclear, obtain a cleaner source, test a separate speech segment, and verify the speaker. Repeating the exact same clip does not create new evidence."
            ]),
            ("False positives and false negatives", [
                "A false positive occurs when human speech looks synthetic. Heavy noise removal, studio processing, low-bitrate compression, speakerphone playback, unusual cadence, or very short samples can contribute. A false negative occurs when generated or cloned speech looks human. High-quality synthesis, careful editing, mixed human and generated segments, or a generator the model has not learned can reduce detection strength.",
                "Both errors matter. A false accusation can harm a real person, while a missed clone can enable fraud. That is why the result should change the next verification step rather than end the investigation. Use stronger language only when audio evidence agrees with provenance and independent confirmation."
            ]),
            ("How to improve decision quality", [
                "Use the original file when available, choose 10 to 30 seconds of one speaker, and avoid music or overlapping voices. Compare independent sections instead of nearby fragments that share the same artifact. Keep track of platform processing: a downloaded social clip and an original WAV are not equivalent inputs.",
                "For teams, define an escalation rule before reviewing cases. For example, a likely AI result plus an unusual payment request can require callback verification, while an unclear result from a public video can trigger source tracing. A consistent workflow is more defensible than changing the threshold after seeing a result you expected."
            ]),
        ],
        "cards_title": "Factors that change reliability",
        "cards": [
            ("Sample length", "Very short clips contain less rhythm and transition evidence."),
            ("Compression", "Messaging apps and re-uploads can add misleading artifacts."),
            ("Generator drift", "New synthesis systems may differ from evaluation data."),
            ("Decision context", "High-stakes actions need independent confirmation."),
        ],
        "faq": [
            ("Is an 80 percent AI score the same as 80 percent accuracy?", "No. A sample score and a model-wide accuracy estimate are different quantities, and neither verifies the speaker's identity or the truth of the message."),
            ("Why did two sections get different results?", "They may contain different noise, compression, speakers, editing, or speech patterns. Review each timestamp and prefer clean independent samples."),
            ("What does unclear mean?", "The selected sample does not provide a strong direction under the site's current thresholds. Obtain a better sample and verify the source."),
            ("Can accuracy improve with a longer file?", "More audio is not automatically better. A focused 10 to 30 second speech segment is often easier to interpret than a long file with mixed conditions."),
        ],
        "cta": ("Test a clear sample", "/ai-voice-checker/"),
    },
    {
        "slug": "ai-voice-detection-privacy",
        "title": "AI Voice Detection Privacy: What Happens to Audio",
        "description": "Learn how Voice AI Checker processes audio, what leaves your browser, when Modulate receives a sample, and when not to upload sensitive speech.",
        "eyebrow": "Privacy guide",
        "h1": "AI Voice Detection Privacy",
        "summary": "Know the data path before uploading. The browser prepares a short sample, the server validates it, and Modulate processes it for synthetic voice detection.",
        "image": "/assets/voice-detection-hero.webp",
        "image_alt": "Short audio sample moving through an AI voice detection workflow",
        "direct": "Voice AI Checker sends a processed WAV sample of up to 30 seconds to its server and then to Modulate's Velma-2 API. The site does not intentionally retain uploaded audio after the request, but users should not upload confidential or legally sensitive recordings without authorization and comfort with third-party processing.",
        "sections": [
            ("What leaves the browser", [
                "When you choose a supported audio or video file, the browser decodes the selected speech and prepares a mono PCM WAV sample at no more than 16 kHz. The analysis control limits the selected window to a maximum of 30 seconds. This reduces upload size and sends only the analysis sample rather than requiring the detector to process an entire long recording.",
                "The prepared WAV is encoded for the detection request and sent to the site's server. The server validates the format and size, trims the sample again to the selected limit, and rejects unsupported or oversized input. Audio detection cannot happen entirely offline because the live model is reached through the server."
            ]),
            ("Third-party model processing", [
                "Online detection is provided through Modulate's Velma-2 Synthetic Voice Detection API. The short audio sample is sent to Modulate for analysis, so Modulate's data-processing terms may apply in addition to this site's privacy policy. If the result identifies the provider as Mock, the app is in demonstration mode and Velma-2 did not produce that result.",
                "The site does not intentionally save the uploaded audio file after the request completes. Detection results may be temporarily reused through a bounded server cache keyed by a file hash, which avoids repeated provider calls for the same sample. The cache stores the result rather than a copy of the audio file."
            ]),
            ("Audio you should not upload", [
                "Do not upload confidential meetings, protected health information, legal communications, private customer calls, security codes, intimate recordings, or children's voices unless you have a lawful basis and permission to process them. Trimming to the suspicious sentence can reduce exposure, but it does not remove the need for consent or organizational policy review.",
                "If a sensitive case must be investigated, start with non-audio evidence: sender details, timestamps, account history, payment instructions, or a trusted callback. An employer, school, newsroom, or regulated organization should use its approved incident process and vendor review rather than treating a public web tool as a private forensic system."
            ]),
            ("Practical privacy controls", [
                "Use the shortest clean segment that answers the question. Remove unrelated conversation before upload, avoid including names or account numbers when they are not needed, and keep the original evidence in an approved location. Do not share the public result as proof about a person; it describes the selected sample only.",
                "Signing in with Google raises the free daily quota and provides account identity information described in the privacy policy. Basic checks can be used without login. Before using the service for repeated organizational work, review the full privacy policy, the provider disclosure, and any retention or consent requirements that apply to your jurisdiction and role."
            ]),
        ],
        "cards_title": "Privacy decision checklist",
        "cards": [
            ("Minimize", "Use only the shortest clean segment needed for the review."),
            ("Authorize", "Confirm you have permission and a lawful basis to process it."),
            ("Understand", "The live sample is processed by Modulate Velma-2."),
            ("Escalate", "Use an approved forensic workflow for sensitive investigations."),
        ],
        "faq": [
            ("Does the detector upload my whole file?", "The browser prepares the selected analysis sample, limited to 30 seconds, before sending a WAV to the server."),
            ("Is the audio sent to another company?", "Yes. Live online detection sends the short sample to Modulate's Velma-2 Synthetic Voice Detection API."),
            ("Does this site store uploaded audio?", "The site does not intentionally retain uploaded audio after the request completes. Review the privacy policy and Modulate's applicable terms for the full processing context."),
            ("Can I use the detector without Google login?", "Yes. Basic daily checks are available without login; signing in raises the free daily limit and adds account data processing."),
        ],
        "cta": ("Read the full privacy policy", "/privacy/"),
    },
    {
        "slug": "ai-voice-scam-calls",
        "title": "AI Voice Scam Calls: How to Check and Respond",
        "description": "Learn how to respond to suspected AI voice scam calls, cloned family or executive voices, urgent payment requests, and suspicious voicemails.",
        "eyebrow": "Scam response",
        "h1": "AI Voice Scam Calls",
        "summary": "The safest response is procedural: stop the requested action, preserve the message, verify through a known channel, and use detection as supporting evidence.",
        "image": "/assets/voice-detection-result.webp",
        "image_alt": "AI voice scam call review with detector signal and verification steps",
        "direct": "If a call uses a familiar voice to demand money, credentials, secrecy, or urgent action, hang up and call the person or organization using a number you already trust. Save the voicemail or message for a separate AI voice check.",
        "sections": [
            ("Recognize the request pattern", [
                "AI voice scams often borrow a trusted identity: a relative in trouble, an executive approving a transfer, a bank agent requesting a code, or a public official promoting an investment. The voice may sound convincing because the attacker only needs a short script. Focus on what the caller wants and whether the request bypasses normal safeguards.",
                "Pressure is a major warning. Requests for secrecy, immediate payment, gift cards, cryptocurrency, remote access, one-time codes, or a new account destination should trigger a stop. These patterns remain dangerous even if the caller is a real human or the detector later returns likely human."
            ]),
            ("What to do during the call", [
                "Do not argue about whether the voice is AI. End the call without sharing information, then use a known number from your contacts, official website, bank card, or company directory. Avoid redialing a number shown in the suspicious message because caller ID and message details can be manipulated.",
                "For family scenarios, agree in advance on a callback process or family verification phrase, but remember that static personal facts can leak. For workplace requests, require the existing payment, procurement, password-reset, or executive-approval workflow. A familiar voice should never replace required authorization."
            ]),
            ("Check a voicemail or saved message", [
                "Preserve the original recording and select 10 to 30 seconds where the suspected speaker talks clearly. Test the request rather than hold music or another voice. A likely AI signal supports escalation, while an unclear or likely human result still leaves the identity and fraud questions open.",
                "If the message contains several speakers or heavy noise, do not force a conclusion. Obtain another sample from the same source if it is safe, compare the speech with trusted public recordings, and document why the request was unusual. Never send money simply because a score appears low risk."
            ]),
            ("Report and protect the account", [
                "Contact the impersonated person, employer, financial institution, or platform through official channels. If credentials or codes were disclosed, change access immediately from a trusted device and notify the relevant provider. Keep call logs, voicemail files, transaction details, and screenshots in their original form.",
                "Use precise language when reporting: describe the voice as suspected synthetic or cloned unless identity and generation are independently established. A detector result can help explain why you paused the transaction, but banks, platforms, employers, and investigators will also need source and account evidence."
            ]),
        ],
        "cards_title": "Immediate response",
        "cards": [
            ("Stop", "Do not send money, codes, files, or credentials during the call."),
            ("Call back", "Use a saved or official number, never one supplied by the caller."),
            ("Check", "Screen a clean saved sample without treating the result as proof."),
            ("Report", "Notify the impersonated person and affected institution quickly."),
        ],
        "faq": [
            ("Can scammers clone a voice from a short recording?", "Voice cloning capabilities vary, but attackers may collect speech from social media, videos, voicemail, or breached data. Treat unusual requests as risky regardless of how the voice was obtained."),
            ("Should I ask the caller a secret question?", "A trusted callback or established approval process is stronger. Personal facts and static questions may be discoverable or leaked."),
            ("What if the detector says likely human?", "Continue verification. The call may use replayed audio, edited human speech, or a real person conducting fraud."),
            ("What evidence should I keep?", "Keep the original audio or voicemail, phone number, timestamp, account details, requested action, and any related messages or transaction records."),
        ],
        "cta": ("Check a saved voice message", "/deepfake-audio-detector/"),
    },
]


def schema_for(page: dict[str, object]) -> str:
    url = f'{BASE_URL}/{page["slug"]}/'
    graph = [
        {
            "@type": "Article",
            "headline": page["h1"],
            "description": page["description"],
            "dateModified": UPDATED,
            "mainEntityOfPage": url,
            "author": {"@type": "Organization", "name": "Voice AI Checker"},
        },
        {
            "@type": "BreadcrumbList",
            "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": "Home", "item": f"{BASE_URL}/"},
                {"@type": "ListItem", "position": 2, "name": page["h1"], "item": url},
            ],
        },
        {
            "@type": "FAQPage",
            "mainEntity": [
                {
                    "@type": "Question",
                    "name": question,
                    "acceptedAnswer": {"@type": "Answer", "text": answer},
                }
                for question, answer in page["faq"]
            ],
        },
    ]
    return json.dumps({"@context": "https://schema.org", "@graph": graph}, indent=2)


def render_page(page: dict[str, object]) -> str:
    canonical = f'{BASE_URL}/{page["slug"]}/'
    sections = "\n".join(
        f'''      <section class="content-section">
        <h2>{html.escape(title)}</h2>
{chr(10).join(f'        <p class="answer">{html.escape(paragraph)}</p>' for paragraph in paragraphs)}
      </section>'''
        for title, paragraphs in page["sections"]
    )
    cards = "\n".join(
        f'          <article class="info-card"><h3>{html.escape(title)}</h3><p>{html.escape(copy)}</p></article>'
        for title, copy in page["cards"]
    )
    faq = "\n".join(
        f'          <article class="faq-item"><h3>{html.escape(question)}</h3><p>{html.escape(answer)}</p></article>'
        for question, answer in page["faq"]
    )
    related = "\n".join(
        [
            '          <a class="related-card" href="/"><strong>AI Voice Detector</strong><span>Run the main detector on a clear voice sample.</span></a>',
            '          <a class="related-card" href="/voice-clone-detector/"><strong>Voice Clone Detector</strong><span>Screen a clip that may imitate a real person.</span></a>',
            '          <a class="related-card" href="/ai-voice-detection-accuracy/"><strong>Detection Accuracy</strong><span>Understand score bands and failure modes.</span></a>',
            '          <a class="related-card" href="/ai-voice-detection-privacy/"><strong>Detection Privacy</strong><span>Review the audio processing path before upload.</span></a>',
        ]
    )
    return f'''<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{html.escape(page["title"])}</title>
    <meta name="description" content="{html.escape(page["description"], quote=True)}" />
    <link rel="canonical" href="{canonical}" />
    <meta property="og:title" content="{html.escape(page["title"], quote=True)}" />
    <meta property="og:description" content="{html.escape(page["description"], quote=True)}" />
    <meta property="og:url" content="{canonical}" />
    <meta property="og:type" content="article" />
    <meta property="og:image" content="{BASE_URL}{page["image"]}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="{html.escape(page["title"], quote=True)}" />
    <meta name="twitter:description" content="{html.escape(page["description"], quote=True)}" />
    <meta name="twitter:image" content="{BASE_URL}{page["image"]}" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="/styles.css?v=20260909-guides" />
    <script type="application/ld+json">
{schema_for(page)}
    </script>
  </head>
  <body>
    <main class="app-shell">
      <header class="topbar guide-topbar">
        <a class="brand-link" href="/" aria-label="AI Voice Detector home"><img class="brand-icon" src="/favicon.svg" width="34" height="34" alt="" /><span>AI Voice Detector</span></a>
        <nav class="main-nav guide-nav" aria-label="Primary"><a href="/">Detector</a><a href="/how-to-detect-ai-voice/">Method</a><a href="/signs-of-ai-generated-voice/">Signs</a><a href="/how-to-detect-cloned-voice/">Voice cloning</a><a href="/ai-voice-detection-accuracy/">Accuracy</a><a href="/ai-voice-detection-privacy/">Privacy</a><a href="/ai-voice-scam-calls/">Scam calls</a></nav>
      </header>
      <nav class="breadcrumb" aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true">/</span><span>{html.escape(page["h1"])}</span></nav>

      <section class="guide-hero">
        <div class="guide-hero-copy">
          <p class="eyebrow">{html.escape(page["eyebrow"])}</p>
          <h1>{html.escape(page["h1"])}</h1>
          <p class="summary">{html.escape(page["summary"])}</p>
          <a class="hero-action" href="{page["cta"][1]}">{html.escape(page["cta"][0])}</a>
        </div>
        <figure class="guide-visual"><img src="{page["image"]}" width="1200" height="675" alt="{html.escape(page["image_alt"], quote=True)}" /></figure>
      </section>

      <section class="content-section guide-answer">
        <h2>Direct answer</h2>
        <p class="answer">{html.escape(page["direct"])}</p>
      </section>

{sections}

      <section class="content-section">
        <h2>{html.escape(page["cards_title"])}</h2>
        <div class="content-grid guide-card-grid">
{cards}
        </div>
      </section>

      <section class="content-section">
        <h2>Related voice detection guides</h2>
        <div class="related-grid guide-related-grid">
{related}
        </div>
      </section>

      <section class="content-section">
        <h2>{html.escape(page["h1"])} FAQ</h2>
        <div class="faq-grid">
{faq}
        </div>
      </section>

      <footer class="site-footer">
        <div class="footer-links"><a href="/">AI Voice Detector</a><a href="/free-ai-voice-detector/">Free Detector</a><a href="/voice-clone-detector/">Clone Detector</a><a href="/pricing/">Pricing</a><a href="/privacy/">Privacy Policy</a><a href="/terms/">Terms</a></div>
        <div class="directory-badge"><a href="https://www.justsimple.tools" target="_blank" rel="noopener noreferrer"><img src="https://www.justsimple.tools/badge.svg" width="150" height="40" alt="Listed on JustSimple Tools" /></a></div>
      </footer>
    </main>
    <script src="/analytics.js" defer></script>
  </body>
</html>
'''


def main() -> None:
    for page in PAGES:
        target = PUBLIC / page["slug"] / "index.html"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(render_page(page), encoding="utf-8")
        print(f"Wrote {target.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
