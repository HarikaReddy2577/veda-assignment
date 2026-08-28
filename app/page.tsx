"use client";

import { useState } from "react";
import { Home as HomeIcon, LayoutGrid, ClipboardList, FileText, Library, Settings, Upload, CheckCircle2, Sparkles, CircleCheck, CircleX, HelpCircle } from "lucide-react";
import { matchQuestionsAndAnswers, MappedItem, Answer } from "@/lib/match";

async function pdfFirstPageToImageUrl(file: File): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf-worker/pdf.worker.min.mjs";

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d")!;
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  return canvas.toDataURL("image/png");
}

type Stage = "idle" | "extracting" | "done" | "error";

export default function Home() {
  const [questionPaper, setQuestionPaper] = useState<File | null>(null);
  const [answerSheet, setAnswerSheet] = useState<File | null>(null);
  const [answerSheetUrl, setAnswerSheetUrl] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [mapped, setMapped] = useState<MappedItem[]>([]);
  const [unmatchedAnswers, setUnmatchedAnswers] = useState<Answer[]>([]);
  const [selected, setSelected] = useState<number>(0);

  const bothUploaded = questionPaper && answerSheet;

  async function extractFile(file: File, type: "question" | "answer") {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", type);
    const res = await fetch("/api/extract", { method: "POST", body: formData });
    return res.json();
  }

  async function handleStartMapping() {
    if (!questionPaper || !answerSheet) return;
    setStage("extracting");
    try {
      if (answerSheet.type === "application/pdf") {
        const imgUrl = await pdfFirstPageToImageUrl(answerSheet);
        setAnswerSheetUrl(imgUrl);
      } else {
        setAnswerSheetUrl(URL.createObjectURL(answerSheet));
      }

      const [qResult, aResult] = await Promise.all([
        extractFile(questionPaper, "question"),
        extractFile(answerSheet, "answer"),
      ]);
      const { mapped, unmatchedAnswers } = matchQuestionsAndAnswers(
        qResult.questions || [],
        aResult.answers || []
      );
      setMapped(mapped);
      setUnmatchedAnswers(unmatchedAnswers);
      setSelected(0);
      setStage("done");

      // Grade each answered question in the background
      mapped.forEach(async (item, i) => {
        if (!item.answerText) return;
        try {
          const res = await fetch("/api/grade", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ questionText: item.questionText, answerText: item.answerText }),
          });
          const grade = await res.json();
          setMapped((prev) => {
            const copy = [...prev];
            copy[i] = { ...copy[i], grade };
            return copy;
          });
        } catch (e) {
          console.error("Grading failed for item", i, e);
        }
      });
    } catch (err) {
      console.error(err);
      setStage("error");
    }
  }

  if (stage === "extracting") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <Sparkles className="mx-auto mb-4 text-orange-400 animate-pulse" size={40} />
          <div className="text-lg font-medium text-gray-800">Extracting...</div>
          <div className="text-sm text-gray-400 mt-1">This may take a while</div>
        </div>
      </div>
    );
  }

  if (stage === "done") {
    const current = mapped[selected];
    const totalScore = mapped.reduce((sum, m) => sum + (m.grade?.score || 0), 0);
    const totalMax = mapped.reduce((sum, m) => sum + (m.grade?.maxScore || 0), 0);

    return (
      <div className="flex min-h-screen bg-gray-50">
        {/* Question list */}
        <div className="w-96 bg-white border-r border-gray-200 overflow-y-auto p-4">
          <h2 className="text-lg font-bold mb-1 text-gray-900">Questions ({mapped.length})</h2>
          {totalMax > 0 && (
            <div className="text-sm text-gray-500 mb-4">
              Total Score: <span className="font-medium text-gray-900">{totalScore} / {totalMax}</span>
            </div>
          )}
          <div className="flex flex-col gap-2">
            {mapped.map((item, i) => (
              <button
                key={i}
                onClick={() => setSelected(i)}
                className={`text-left border rounded-xl p-3 ${
                  i === selected ? "border-orange-400 bg-orange-50" : "border-gray-200 hover:bg-gray-50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-900">Q{item.questionNumber}</span>
                  <div className="flex items-center gap-2">
                    {item.grade && (
                      <span className="text-xs text-gray-500">{item.grade.score}/{item.grade.maxScore}</span>
                    )}
                    {item.status === "answered" ? (
                      <CircleCheck size={16} className="text-green-500" />
                    ) : (
                      <CircleX size={16} className="text-red-400" />
                    )}
                  </div>
                </div>
                <div className="text-xs text-gray-500 mt-1 line-clamp-2">{item.questionText}</div>
              </button>
            ))}
          </div>

          {unmatchedAnswers.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                <HelpCircle size={14} /> Unmatched answers ({unmatchedAnswers.length})
              </h3>
              {unmatchedAnswers.map((a, i) => (
                <div key={i} className="text-xs text-gray-500 border border-gray-200 rounded-lg p-2 mb-2">
                  {a.text}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Detail view */}
        <div className="flex-1 p-8 overflow-y-auto">
          {current ? (
            <div className="grid grid-cols-2 gap-6 max-w-5xl">
              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <div className="text-sm text-orange-500 font-medium mb-2">Question {current.questionNumber}</div>
                <div className="text-lg font-medium text-gray-900 mb-6">{current.questionText}</div>

                <div className="text-sm text-gray-500 font-medium mb-2">Student's Answer</div>
                {current.answerText ? (
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-gray-800 mb-4">
                    {current.answerText}
                  </div>
                ) : (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-500 text-sm mb-4">
                    Not answered
                  </div>
                )}

                {current.grade && (
                  <div className={`rounded-xl p-4 border ${current.grade.correct ? "bg-green-50 border-green-200" : "bg-orange-50 border-orange-200"}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-900">
                        Score: {current.grade.score} / {current.grade.maxScore}
                      </span>
                      <span className={`text-xs font-medium ${current.grade.correct ? "text-green-600" : "text-orange-600"}`}>
                        {current.grade.correct ? "Correct" : "Needs Improvement"}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600">{current.grade.feedback}</div>
                  </div>
                )}
                {!current.grade && current.answerText && (
                  <div className="text-xs text-gray-400">Grading in progress...</div>
                )}
              </div>

              <div className="bg-white rounded-2xl border border-gray-200 p-4">
                <div className="text-sm text-gray-500 font-medium mb-2">Answer Sheet</div>
                {answerSheetUrl ? (
                  <div className="relative inline-block w-full">
                    <img src={answerSheetUrl} alt="Answer sheet" className="w-full rounded-lg block" />
                    {current.bbox && (
                      <div
                        className="absolute border-2 border-orange-500 bg-orange-400/20 rounded-sm"
                        style={{
                          left: `${current.bbox.x}%`,
                          top: `${current.bbox.y}%`,
                          width: `${current.bbox.width}%`,
                          height: `${current.bbox.height}%`,
                        }}
                      />
                    )}
                  </div>
                ) : (
                  <div className="text-gray-400 text-sm">No image available</div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-gray-400">No question selected</div>
          )}
        </div>
      </div>
    );
  }

  if (stage === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="text-lg font-medium text-red-600">Something went wrong</div>
          <button
            onClick={() => setStage("idle")}
            className="mt-4 bg-black text-white rounded-full py-2 px-4 text-sm"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col p-4">
        <div className="font-bold text-lg mb-6 text-gray-900">VedaAI</div>
        <button className="bg-black text-white rounded-full py-2 px-4 text-sm font-medium mb-6">
          + AI Teacher's Toolkit
        </button>
        <nav className="flex flex-col gap-1 text-sm text-gray-700">
          <SidebarItem icon={<HomeIcon size={16} />} label="Home" />
          <SidebarItem icon={<LayoutGrid size={16} />} label="My Classroom" />
          <SidebarItem icon={<ClipboardList size={16} />} label="Assignments" />
          <SidebarItem icon={<FileText size={16} />} label="Exams" active />
          <SidebarItem icon={<Library size={16} />} label="My Library" />
        </nav>
        <div className="mt-auto flex flex-col gap-1 text-sm text-gray-700">
          <SidebarItem icon={<Settings size={16} />} label="Settings" />
          <div className="mt-2 p-3 bg-gray-50 rounded-lg text-xs">
            <div className="font-medium">Delhi Public School</div>
            <div className="text-gray-500">Bokaro Steel City</div>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex items-center justify-center p-8">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 w-full max-w-2xl text-center">
          <h1 className="text-2xl font-bold text-gray-900">
            Upload <span className="text-orange-500">Question Paper & Answer Sheets</span>
          </h1>
          <p className="text-gray-500 mt-2 text-sm">Upload both files to get started</p>

          <div className="flex justify-center my-6">
            <div className="w-16 h-16 rounded-full bg-orange-100 border-2 border-dashed border-orange-300 flex items-center justify-center">
              📄
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <UploadTile label="Question Paper" file={questionPaper} onFileSelect={setQuestionPaper} />
            <UploadTile label="Answer Sheet" file={answerSheet} onFileSelect={setAnswerSheet} />
          </div>

          <button
            disabled={!bothUploaded}
            onClick={handleStartMapping}
            className={`mt-6 rounded-full py-2 px-6 text-sm font-medium ${
              bothUploaded ? "bg-black text-white cursor-pointer" : "bg-gray-200 text-gray-400 cursor-not-allowed"
            }`}
          >
            Start Mapping →
          </button>

          <p className="text-xs text-gray-400 mt-3">
            Once both files are uploaded, you'll be able to map answers with questions
          </p>
        </div>
      </main>
    </div>
  );
}

function SidebarItem({ icon, label, active }: { icon: React.ReactNode; label: string; active?: boolean }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer ${active ? "bg-gray-100 font-medium text-gray-900" : "hover:bg-gray-50"}`}>
      {icon}
      {label}
    </div>
  );
}

function UploadTile({ label, file, onFileSelect }: { label: string; file: File | null; onFileSelect: (file: File) => void }) {
  return (
    <label className="border border-gray-200 rounded-xl p-6 flex flex-col items-center gap-2 cursor-pointer hover:border-orange-300">
      <input type="file" accept=".pdf,image/*" className="hidden" onChange={(e) => { if (e.target.files && e.target.files[0]) onFileSelect(e.target.files[0]); }} />
      {file ? <CheckCircle2 size={20} className="text-green-500" /> : <Upload size={20} className="text-gray-400" />}
      <div className="text-sm">
        {file ? (
          <span className="text-gray-700 truncate max-w-[150px] inline-block align-middle">{file.name}</span>
        ) : (
          <>
            <span className="text-gray-700">Upload</span> <span className="text-orange-500 font-medium">{label}</span>
          </>
        )}
      </div>
      <div className="text-xs text-gray-400">Max 10MB</div>
    </label>
  );
}