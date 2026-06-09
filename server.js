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

// Model served via HuggingFace Inference Providers (router).
const MODEL = process.env.HF_MODEL || "meta-llama/Llama-3.1-8B-Instruct";

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

        const prompt = `You are a creative storyteller. Based on this person's details, generate exactly 3 alternate-universe life scenarios showing what could happen if they made different choices.

Return ONLY a valid JSON array of exactly 3 objects. No markdown, no commentary, no text before or after — just the raw JSON array.

Each object MUST have these exact keys (keys stay in English):
- "title": short catchy universe name (string)
- "subtitle": one short line describing the path (string)
- "description": 2-3 sentence story of this universe (string)
- "careerPath": the career they pursued (string)
- "keyEvents": array of 3-4 short strings (major milestones)
- "outcome": where they ended up (string)

VERY IMPORTANT: Write ALL string VALUES (title, subtitle, description, careerPath, every keyEvents item, and outcome) in ${languageName}. The JSON keys must remain exactly in English as listed above. Do not translate the keys.

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
                    messages: [
                        {
                            role: "system",
                            content: `You are a precise JSON generator. You only output valid JSON arrays with no extra text. All string values must be written in ${languageName}, but JSON keys must stay in English.`
                        },
                        { role: "user", content: prompt }
                    ],
                    max_tokens: 1500,
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
