import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Verify API token exists on startup
if (!process.env.HUGGINGFACE_TOKEN) {
    console.error("❌ HUGGINGFACE_TOKEN not found in environment variables!");
    process.exit(1);
}

console.log("✅ HUGGINGFACE_TOKEN loaded");

// ===== Azure Speech config (normalized + diagnosed at startup) =====
// Region must be the short id like "germanywestcentral". This normalization
// also accepts "Germany West Central" or even a pasted endpoint URL like
// "https://germanywestcentral.api.cognitive.microsoft.com/" and extracts
// the region from it automatically.
const SPEECH_KEY = (process.env.AZURE_SPEECH_KEY || "").trim();
let _rawRegion = (process.env.AZURE_SPEECH_REGION || "").trim().toLowerCase();
const _urlMatch = _rawRegion.match(/^https?:\/\/([a-z0-9]+)\./);
if (_urlMatch) _rawRegion = _urlMatch[1];
const SPEECH_REGION = _rawRegion.replace(/[^a-z0-9]/g, "");

if (SPEECH_KEY && SPEECH_REGION) {
    console.log(`✅ Azure Speech configured (region: ${SPEECH_REGION})`);
} else {
    console.log("⚠️ Azure Speech NOT configured — narration disabled. Need env vars AZURE_SPEECH_KEY and AZURE_SPEECH_REGION (exact names).");
}

// Model served via HuggingFace Inference Providers (router).
// Gemma 3 27B: 140+ language support (incl. Latvian and other Baltic/low-resource
// European languages). Override with HF_MODEL env var without code changes.
const MODEL = process.env.HF_MODEL || "google/gemma-3-27b-it";

// Supported output languages
const LANGUAGES = {
    en: "English",
    sq: "Albanian",
    eu: "Basque",
    bs: "Bosnian",
    bg: "Bulgarian",
    ca: "Catalan",
    hr: "Croatian",
    cs: "Czech",
    da: "Danish",
    nl: "Dutch",
    et: "Estonian",
    fi: "Finnish",
    fr: "French",
    gl: "Galician",
    de: "German",
    el: "Greek",
    hu: "Hungarian",
    is: "Icelandic",
    ga: "Irish",
    it: "Italian",
    lv: "Latvian",
    lt: "Lithuanian",
    lb: "Luxembourgish",
    mk: "Macedonian",
    mt: "Maltese",
    no: "Norwegian",
    pl: "Polish",
    pt: "Portuguese",
    ro: "Romanian",
    sr: "Serbian",
    sk: "Slovak",
    sl: "Slovenian",
    es: "Spanish",
    sv: "Swedish",
    tr: "Turkish",
    cy: "Welsh"
};

function extractJSON(text) {
    try {
        const cleaned = text
            .replace(/```json/g, "")
            .replace(/```/g, "")
            .trim();

        const start = cleaned.indexOf("[");
        const end = cleaned.lastIndexOf("]") + 1;

        if (start === -1 || end === 0) {
            console.error("❌ No JSON array found in response");
            return null;
        }

        return JSON.parse(cleaned.slice(start, end));
    } catch (e) {
        console.error("❌ JSON parse failed:", e.message);
        return null;
    }
}

app.get("/health", (req, res) => {
    res.json({ status: "ok" });
});

// ===== Azure AI Speech: one neural voice per supported language =====
// Note: Luxembourgish (lb) has no Azure voice yet → falls back to German.
const VOICES = {
    en: "en-US-JennyNeural",
    sq: "sq-AL-AnilaNeural",
    eu: "eu-ES-AinhoaNeural",
    bs: "bs-BA-VesnaNeural",
    bg: "bg-BG-KalinaNeural",
    ca: "ca-ES-JoanaNeural",
    hr: "hr-HR-GabrijelaNeural",
    cs: "cs-CZ-VlastaNeural",
    da: "da-DK-ChristelNeural",
    nl: "nl-NL-FennaNeural",
    et: "et-EE-AnuNeural",
    fi: "fi-FI-SelmaNeural",
    fr: "fr-FR-DeniseNeural",
    gl: "gl-ES-SabelaNeural",
    de: "de-DE-KatjaNeural",
    el: "el-GR-AthinaNeural",
    hu: "hu-HU-NoemiNeural",
    is: "is-IS-GudrunNeural",
    ga: "ga-IE-OrlaNeural",
    it: "it-IT-ElsaNeural",
    lv: "lv-LV-EveritaNeural",
    lt: "lt-LT-OnaNeural",
    lb: "de-DE-KatjaNeural",
    mk: "mk-MK-MarijaNeural",
    mt: "mt-MT-GraceNeural",
    no: "nb-NO-PernilleNeural",
    pl: "pl-PL-ZofiaNeural",
    pt: "pt-PT-RaquelNeural",
    ro: "ro-RO-AlinaNeural",
    sr: "sr-RS-SophieNeural",
    sk: "sk-SK-ViktoriaNeural",
    sl: "sl-SI-PetraNeural",
    es: "es-ES-ElviraNeural",
    sv: "sv-SE-SofieNeural",
    tr: "tr-TR-EmelNeural",
    cy: "cy-GB-NiaNeural"
};

app.post("/speak", async (req, res) => {
    try {
        if (!SPEECH_KEY || !SPEECH_REGION) {
            console.warn("⚠️ /speak called but Azure Speech env vars are missing");
            return res.status(503).json({ error: "Speech not configured" });
        }

        let { text, lang } = req.body;
        if (!text) {
            return res.status(400).json({ error: "Missing text" });
        }

        // Cap length to protect the free tier
        text = String(text).slice(0, 1000);

        const voice = VOICES[lang] || VOICES.en;
        const xmlLang = voice.split("-").slice(0, 2).join("-");
        const escaped = text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");

        const ssml = `<speak version='1.0' xml:lang='${xmlLang}'><voice name='${voice}'>${escaped}</voice></speak>`;

        console.log("🔊 TTS request:", voice, "| chars:", text.length);

        const ttsRes = await fetch(
            `https://${SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`,
            {
                method: "POST",
                headers: {
                    "Ocp-Apim-Subscription-Key": SPEECH_KEY,
                    "Content-Type": "application/ssml+xml",
                    "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
                    "User-Agent": "ParallelUniverse"
                },
                body: ssml
            }
        );

        if (!ttsRes.ok) {
            const errText = await ttsRes.text();
            console.error("❌ Azure Speech error:", ttsRes.status, errText.slice(0, 200));
            return res.status(500).json({
                error: `Azure Speech error: ${ttsRes.status}`,
                details: errText.slice(0, 200)
            });
        }

        const audioBuffer = Buffer.from(await ttsRes.arrayBuffer());
        console.log("✅ TTS audio generated:", audioBuffer.length, "bytes");

        res.set("Content-Type", "audio/mpeg").send(audioBuffer);

    } catch (err) {
        console.error("❌ /speak error:", err.message);
        res.status(500).json({ error: "Speech server error", message: err.message });
    }
});

app.post("/generate", async (req, res) => {
    try {
        console.log("📥 Received request");

        const { name, interests, situation, decision, details, lang } = req.body;

        if (!name || !interests || !situation || !decision || !details) {
            return res.status(400).json({
                error: "Missing required fields",
                received: { name, interests, situation, decision, details }
            });
        }

        // Resolve language (default English)
        const languageName = LANGUAGES[lang] || "English";
        console.log("🌐 Output language:", languageName);

        const prompt = `You are a creative storyteller and life advisor. Based on this person's details, generate exactly 3 alternate-universe life scenarios showing what could happen if they made different choices.

Return ONLY a valid JSON array of exactly 3 objects. No markdown, no commentary, no text before or after — just the raw JSON array.

Each object MUST have these exact keys (keys stay in English):
- "title": short catchy universe name (string)
- "subtitle": one short line describing the path (string)
- "description": 2-3 sentence story of this universe (string)
- "careerPath": the career they pursued (string)
- "keyEvents": array of 3-4 short strings (major milestones)
- "outcome": where they ended up (string)
- "recommendations": object with exactly these keys:
    - "jobRoles": array of 2-3 REAL job titles that exist on job boards today and fit this universe and the person's interests (short, searchable titles like "UX Designer" or "Data Analyst" — values in ${languageName} but keep titles recognizable/searchable)
    - "travel": array of 1-2 objects, each {"place": "City, Country", "reason": "one short sentence why it fits this universe"} — real places relevant to this universe's lifestyle
    - "food": array of 1-2 objects, each {"item": "specific dish or cuisine/restaurant type", "reason": "one short sentence tying it to this universe"}

The recommendations MUST be tailored to the person's specific interests, situation, and decision — not generic. Different universes should get different recommendations.

VERY IMPORTANT: Write ALL string VALUES in ${languageName}. The JSON keys must remain exactly in English as listed above. Do not translate the keys. For "place" keep the city and country names in their commonly used ${languageName} forms.

Person: ${name}
Interests: ${interests}
Current Situation: ${situation}
Big Decision: ${decision}
Details: ${details}

Make universe 1 optimistic/bold, universe 2 balanced/realistic, universe 3 steady/cautionary. Output ONLY the JSON array, with all values written in ${languageName}.`;

        console.log("🔄 Calling HuggingFace router with model:", MODEL);

        const response = await fetch(
            "https://router.huggingface.co/v1/chat/completions",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${process.env.HUGGINGFACE_TOKEN}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: MODEL,
                    // Gemma's chat template handles system roles inconsistently across
                    // providers, so the instruction is folded into the user message.
                    messages: [
                        {
                            role: "user",
                            content: `You are a precise JSON generator. You only output valid JSON arrays with no extra text. All string values must be written in ${languageName}, but JSON keys must stay in English.\n\n${prompt}`
                        }
                    ],
                    max_tokens: 2800,
                    temperature: 0.8
                })
            }
        );

        console.log("📤 HuggingFace status:", response.status);

        if (!response.ok) {
            const errorData = await response.text();
            console.error("❌ HuggingFace error:", response.status, errorData.slice(0, 300));
            return res.status(500).json({
                error: `HuggingFace API error: ${response.status}`,
                details: errorData.slice(0, 300)
            });
        }

        const data = await response.json();
        console.log("📦 HuggingFace response received");

        // Router endpoint is OpenAI-compatible: choices[0].message.content
        const text = data?.choices?.[0]?.message?.content;

        if (!text) {
            console.error("❌ No text in response:", JSON.stringify(data).slice(0, 300));
            return res.status(500).json({
                error: "No text returned from HuggingFace",
                raw: data
            });
        }

        console.log("📝 Raw response start:", text.slice(0, 150));

        const parsed = extractJSON(text);

        if (!parsed || !Array.isArray(parsed)) {
            console.error("❌ Failed to parse JSON. Raw:", text.slice(0, 300));
            return res.status(500).json({
                error: "Failed to parse JSON response",
                rawText: text.slice(0, 300)
            });
        }

        console.log("✅ Success! Generated", parsed.length, "universes");

        res.json({ universes: parsed });

    } catch (err) {
        console.error("❌ Server error:", err.message);
        console.error(err.stack);
        res.status(500).json({
            error: "Server error",
            message: err.message
        });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`💡 Health check: http://localhost:${PORT}/health`);
});
