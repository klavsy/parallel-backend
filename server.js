import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

function extractJSON(text) {
    try {
        // remove markdown ```json
        const cleaned = text
            .replace(/```json/g, "")
            .replace(/```/g, "")
            .trim();

        const start = cleaned.indexOf("[");
        const end = cleaned.lastIndexOf("]") + 1;

        return JSON.parse(cleaned.slice(start, end));
    } catch (e) {
        console.log("❌ JSON parse failed");
        return null;
    }
}

app.post("/generate", async (req, res) => {
    try {
        const { name, interests, situation, decision, details } = req.body;

        const prompt = `
Return ONLY valid JSON array (no markdown).

Format:
[
  {
    "title": "string",
    "subtitle": "string",
    "description": "string",
    "careerPath": "string",
    "keyEvents": ["string","string","string"],
    "outcome": "string"
  }
]

User:
Name: ${name}
Interests: ${interests}
Situation: ${situation}
Decision: ${decision}
Details: ${details}
`;

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_KEY}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }]
                })
            }
        );

        const data = await response.json();

        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!text) {
            return res.status(500).json({
                error: "No text returned from Gemini",
                raw: data
            });
        }

        const parsed = extractJSON(text);

        if (!parsed) {
            return res.status(500).json({
                error: "Failed to parse Gemini JSON",
                raw: text
            });
        }

        res.json({ universes: parsed });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server crash" });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log("🚀 Server running on port", PORT);
});
