import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();

app.use(cors({ origin: "*" }));
app.use(express.json());

app.post("/generate", async (req, res) => {
    const { name, interests, situation, decision, details } = req.body;

    const prompt = `
Return ONLY JSON.

Create 3 universes:

{
  "universes": [
    {
      "title": "",
      "subtitle": "",
      "description": "",
      "careerPath": "",
      "keyEvents": ["", "", ""],
      "outcome": ""
    }
  ]
}

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

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    res.json({ result: text });
});

app.listen(3000, () => console.log("Server running"));
