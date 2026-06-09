import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();

app.use(cors({ origin: "*" }));
app.use(express.json());

/*
  Health check
*/
app.get("/", (req, res) => {
    res.json({
        status: "online",
        service: "Parallel Universe AI Backend"
    });
});

/*
  Generate Universes
*/
app.post("/generate", async (req, res) => {
    try {
        const {
            name,
            interests,
            situation,
            decision,
            details
        } = req.body;

        if (
            !name ||
            !interests ||
            !situation ||
            !decision ||
            !details
        ) {
            return res.status(400).json({
                error: "Missing required fields"
            });
        }

        const prompt = `
You are an AI that creates realistic alternative futures.

IMPORTANT:

Return ONLY valid JSON.

Do NOT use markdown.
Do NOT use code blocks.
Do NOT explain anything.
Do NOT add text before or after the JSON.

Return this exact structure:

{
  "universes": [
    {
      "title": "",
      "subtitle": "",
      "description": "",
      "careerPath": "",
      "keyEvents": ["", "", "", ""],
      "outcome": ""
    },
    {
      "title": "",
      "subtitle": "",
      "description": "",
      "careerPath": "",
      "keyEvents": ["", "", "", ""],
      "outcome": ""
    },
    {
      "title": "",
      "subtitle": "",
      "description": "",
      "careerPath": "",
      "keyEvents": ["", "", "", ""],
      "outcome": ""
    }
  ]
}

Create 3 unique future timelines.

User Information:

Name: ${name}
Interests: ${interests}
Current Situation: ${situation}
Decision: ${decision}
Additional Context: ${details}
`;

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_KEY}`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    contents: [
                        {
                            parts: [
                                {
                                    text: prompt
                                }
                            ]
                        }
                    ]
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            console.error("Gemini API Error:", data);

            return res.status(500).json({
                error: "Gemini API request failed",
                details: data
            });
        }

        const text =
            data?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!text) {
            return res.status(500).json({
                error: "No response received from Gemini"
            });
        }

        try {
            const cleaned = text
                .replace(/```json/g, "")
                .replace(/```/g, "")
                .trim();

            const parsed = JSON.parse(cleaned);

            return res.json(parsed);
        } catch (parseError) {
            console.error("JSON Parse Error:", parseError);

            return res.status(500).json({
                error: "AI returned invalid JSON",
                rawResponse: text
            });
        }
    } catch (error) {
        console.error("Server Error:", error);

        return res.status(500).json({
            error: "Internal server error",
            message: error.message
        });
    }
});

/*
  Start Server
*/
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
