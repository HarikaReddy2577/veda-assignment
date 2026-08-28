export type Question = { number: string; text: string };
export type Answer = {
  label: string | null;
  text: string;
  bbox?: { x: number; y: number; width: number; height: number };
};

export type Grade = {
  score: number;
  maxScore: number;
  correct: boolean;
  feedback: string;
};

export type MappedItem = {
  questionNumber: string;
  questionText: string;
  answerText: string | null;
  bbox?: { x: number; y: number; width: number; height: number };
  status: "answered" | "unanswered";
  grade?: Grade;
};

export function matchQuestionsAndAnswers(questions: Question[], answers: Answer[]) {
  const mapped: MappedItem[] = questions.map((q) => {
    const match = answers.find((a) => a.label === q.number);
    return {
      questionNumber: q.number,
      questionText: q.text,
      answerText: match ? match.text : null,
      bbox: match ? match.bbox : undefined,
      status: match ? "answered" : "unanswered",
    };
  });

  const usedLabels = new Set(questions.map((q) => q.number));
  const unmatchedAnswers = answers.filter((a) => !a.label || !usedLabels.has(a.label));

  return { mapped, unmatchedAnswers };
}