import { useEffect, useState } from "react";
import * as pdfjsLib from "pdfjs-dist/build/pdf.mjs";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { createWorker } from "tesseract.js";
import Swal from "sweetalert2";
import { useNavigate } from "react-router-dom";
import { academicCalendarService } from "../services/academicCalendarService";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const CATEGORIES = [
    "Holiday",
    "Exam",
    "Payment",
    "Registration",
    "Class",
    "Result",
    "Event",
    "Attendance",
    "Other",
];

const SUMMARY_TYPES = ["Exam", "Payment", "Class", "Other"];

function detectCategory(text = "") {
    const lower = String(text || "").toLowerCase();

    if (/(attendance|student attendance report)/i.test(lower)) return "Attendance";
    if (/(holiday|eid|ashura|janmashtami|miladunnabi|closed|semester break)/i.test(lower)) return "Holiday";
    if (/(exam|examination|midterm|final|supplementary|preparatory leave)/i.test(lower)) return "Exam";
    if (/(payment|tuition|installment|fee|dues|balance)/i.test(lower)) return "Payment";
    if (/(registration|pre-registration|add\/drop|withdrawal)/i.test(lower)) return "Registration";
    if (/(class|classes|orientation|commencement)/i.test(lower)) return "Class";
    if (/(result|grade|publication)/i.test(lower)) return "Result";
    if (/(parents day|census day|research showcase|club|evaluation|award|r u ok)/i.test(lower)) return "Event";

    return "Other";
}

function cleanOcrText(text = "") {
    return text
        .replace(/\r/g, "\n")
        .replace(/[|]/g, " ")
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'")
        .replace(/\u00A0/g, " ")
        .replace(/[ \t]+/g, " ")
        .replace(/\n\s+/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function looksLikeDateLine(line = "") {
    return /(\d{1,2}\s+(May|June|Jun|July|Jul|Aug|August|Sep|Sept|September)\s+\d{4})|(\d{1,2}\s+(May|June|Jun|July|Jul|Aug|August|Sep|Sept|September)\s*[–-]\s*\d{1,2}\s+(May|June|Jun|July|Jul|Aug|August|Sep|Sept|September)?\s*\d{4})/i.test(
        line
    );
}

function parseCalendarRows(text = "") {
    const lines = cleanOcrText(text)
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);

    const events = [];
    const summaries = [];

    for (const rawLine of lines) {
        const line = rawLine.replace(/\s+/g, " ").trim();

        if (/total\s+class|exam\s+schedule|payment/i.test(line)) {
            continue;
        }

        if (looksLikeDateLine(line)) {
            let dateText = "";
            let dayText = "";
            let title = "";

            const dateMatch = line.match(
                /^(.+?\d{4})\s+([A-Za-z]+(?:\s*[–-]\s*[A-Za-z]+)?)\s+(.+)$/
            );

            if (dateMatch) {
                dateText = dateMatch[1]?.trim();
                dayText = dateMatch[2]?.trim();
                title = dateMatch[3]?.trim();
            } else {
                const parts = line.split(/\s{2,}/);
                dateText = parts[0] || "";
                dayText = parts[1] || "";
                title = parts.slice(2).join(" ");
            }

            if (dateText && title) {
                const category = detectCategory(title);

                events.push({
                    dateText,
                    dayText,
                    category,
                    title,
                    note: "",
                    isHighlighted: category === "Exam" || category === "Holiday",
                });
            }
        }

        if (/midterm|final examination|supplementary/i.test(line) && !looksLikeDateLine(line)) {
            summaries.push({
                type: "Exam",
                title: line,
                dateText: "",
            });
        }

        if (/installment|payment|tuition/i.test(line) && !looksLikeDateLine(line)) {
            summaries.push({
                type: "Payment",
                title: line,
                dateText: "",
            });
        }
    }

    return {
        events,
        summaries,
    };
}

function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) => {
                if (blob) resolve(blob);
                else reject(new Error("Failed to convert PDF page to image."));
            },
            "image/png",
            1
        );
    });
}

async function renderPdfPageToImageBlob(page) {
    const viewport = page.getViewport({ scale: 3 });

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({
        canvasContext: context,
        viewport,
    }).promise;

    return canvasToBlob(canvas);
}

const EMPTY_JSON_TEMPLATE = {
    title: "Academic Calendar: Summer 2026",
    semester: "Summer 2026",
    academicYear: "2026",
    events: [
        {
            dateText: "06 May 2026",
            dayText: "Wednesday",
            category: "Class",
            title: "Orientation and commencement of classes",
            note: "",
            isHighlighted: false,
        },
    ],
    summaries: [
        {
            type: "Exam",
            title: "Midterm Examination",
            dateText: "25 June – 03 July 2026",
        },
    ],
};

const SAMPLE_ACADEMIC_CALENDAR_JSON = {
    title: "Academic Calendar: Summer 2026",
    semester: "Summer 2026",
    academicYear: "2026",
    events: [
        {
            dateText: "06 May 2026",
            dayText: "Wednesday",
            category: "Class",
            title: "Orientation and commencement of classes of Spring – 2026",
            note: "",
            isHighlighted: false,
        },
        {
            dateText: "06 May – 22 May 2026",
            dayText: "Wednesday – Friday",
            category: "Payment",
            title:
                "1st Installment Fees Payment for confirmation of registration by depositing at least Tk. 6,000 without late fee",
            note: "",
            isHighlighted: false,
        },
        {
            dateText: "12 May – 21 May 2026",
            dayText: "Tuesday – Thursday",
            category: "Registration",
            title: "Submission of application for tuition fees waiver",
            note: "",
            isHighlighted: false,
        },
        {
            dateText: "21 May 2026",
            dayText: "Thursday",
            category: "Registration",
            title: "Deadline of course add/drop and semester withdrawal",
            note: "",
            isHighlighted: false,
        },
        {
            dateText: "24 May – 31 May 2026",
            dayText: "Sunday – Sunday",
            category: "Holiday",
            title: "Eid-ul-Adha Holidays",
            note: "Subject to the appearance of the moon",
            isHighlighted: true,
        },
        {
            dateText: "01 June – 04 June 2026",
            dayText: "Monday – Thursday",
            category: "Payment",
            title: "Payment for confirmation of registration with late fee of Tk. 1,000",
            note: "",
            isHighlighted: false,
        },
        {
            dateText: "03 June 2026",
            dayText: "Wednesday",
            category: "Result",
            title:
                "Last day of Grade Submission of Incomplete Grades of Spring Semester 2026 by concerned Department/Program Office",
            note: "",
            isHighlighted: false,
        },
        {
            dateText: "06 June 2026",
            dayText: "Saturday",
            category: "Result",
            title: "Publication of final list of registered students Summer Semester 2026",
            note: "",
            isHighlighted: false,
        },
        {
            dateText: "07 June – 10 June 2026",
            dayText: "Sunday – Wednesday",
            category: "Event",
            title: "Club Member Collection Week",
            note: "",
            isHighlighted: false,
        },
        {
            dateText: "07 June 2026",
            dayText: "Sunday",
            category: "Event",
            title: "Census Day",
            note: "",
            isHighlighted: false,
        },
        {
            dateText: "07 June – 11 June 2026",
            dayText: "Sunday – Thursday",
            category: "Event",
            title: "R U OK!",
            note: "",
            isHighlighted: true,
        },
        {
            dateText: "13 June 2026",
            dayText: "Saturday",
            category: "Event",
            title: "Parents Day",
            note: "",
            isHighlighted: false,
        },
        {
            dateText: "18 June 2026",
            dayText: "Thursday",
            category: "Payment",
            title: "Declaration of tuition fee waiver list",
            note: "",
            isHighlighted: false,
        },
        {
            dateText: "10 June – 24 June 2026",
            dayText: "Wednesday – Wednesday",
            category: "Payment",
            title: "Payment of tuition fees: 2nd Installment at least 50% of total dues",
            note: "",
            isHighlighted: false,
        },
        {
            dateText: "16 June 2026",
            dayText: "Tuesday",
            category: "Event",
            title: "Deans Award for Students",
            note: "",
            isHighlighted: true,
        },
        {
            dateText: "22 June 2026",
            dayText: "Monday",
            category: "Attendance",
            title: "Deadline of submission of student attendance report before Midterm Examination",
            note: "",
            isHighlighted: false,
        },
        {
            dateText: "23 June 2026",
            dayText: "Tuesday",
            category: "Class",
            title: "Last day of classes before Midterm Examination",
            note: "",
            isHighlighted: false,
        },
        {
            dateText: "24 June 2026",
            dayText: "Wednesday",
            category: "Exam",
            title: "Preparatory Leave for Midterm Examination",
            note: "",
            isHighlighted: true,
        },
        {
            dateText: "25 June – 03 July 2026",
            dayText: "Thursday – Friday",
            category: "Exam",
            title: "Midterm Examination",
            note: "",
            isHighlighted: true,
        },
        {
            dateText: "26 June 2026",
            dayText: "Friday",
            category: "Holiday",
            title: "Ashura Holiday",
            note: "Subject to the appearance of the moon",
            isHighlighted: true,
        },
        {
            dateText: "04 July 2026",
            dayText: "Saturday",
            category: "Class",
            title: "Classes resume after Midterm Examination",
            note: "",
            isHighlighted: false,
        },
        {
            dateText: "08 July 2026",
            dayText: "Wednesday",
            category: "Exam",
            title:
                "Deadline of submission of application for Supplementary Midterm Examination along with fee Tk. 100 per course",
            note: "",
            isHighlighted: false,
        },
        {
            dateText: "15 July – 19 July 2026",
            dayText: "Wednesday – Sunday",
            category: "Exam",
            title: "Supplementary Midterm Examination",
            note: "",
            isHighlighted: true,
        },
        {
            dateText: "26 July 2026",
            dayText: "Sunday",
            category: "Result",
            title: "Deadline of submission of Midterm Examination Results",
            note: "",
            isHighlighted: false,
        },
        {
            dateText: "26 July – 02 Aug 2026",
            dayText: "Sunday – Sunday",
            category: "Registration",
            title: "Pre-Registration for Fall 2026",
            note: "",
            isHighlighted: false,
        },
        {
            dateText: "05 Aug 2026",
            dayText: "Wednesday",
            category: "Holiday",
            title: "July Mass Uprising Day Holiday",
            note: "",
            isHighlighted: true,
        },
        {
            dateText: "06 Aug – 19 Aug 2026",
            dayText: "Thursday – Wednesday",
            category: "Payment",
            title: "Payment of tuition fees: Final Installment without late fee",
            note: "",
            isHighlighted: false,
        },
        {
            dateText: "16 Aug – 20 Aug 2026",
            dayText: "Sunday – Thursday",
            category: "Event",
            title: "Research Showcase Week",
            note: "",
            isHighlighted: false,
        },
        {
            dateText: "17 Aug – 22 Aug 2026",
            dayText: "Monday – Saturday",
            category: "Event",
            title: "Teachers Evaluation",
            note: "",
            isHighlighted: false,
        },
        {
            dateText: "19 Aug 2026",
            dayText: "Wednesday",
            category: "Attendance",
            title: "Deadline of submission of student attendance report before Final Examination",
            note: "",
            isHighlighted: false,
        },
        {
            dateText: "20 Aug – 24 Aug 2026",
            dayText: "Thursday – Monday",
            category: "Payment",
            title: "Payment of tuition fees: Final Installment with late fee Tk. 1,000",
            note: "Make your balance zero",
            isHighlighted: false,
        },
        {
            dateText: "20 Aug 2026",
            dayText: "Thursday",
            category: "Class",
            title: "Last day of classes before Final Examination",
            note: "",
            isHighlighted: true,
        },
        {
            dateText: "21 Aug 2026",
            dayText: "Friday",
            category: "Exam",
            title: "Preparatory Leave for Final Examination",
            note: "",
            isHighlighted: true,
        },
        {
            dateText: "22 Aug – 30 Aug 2026",
            dayText: "Saturday – Sunday",
            category: "Exam",
            title: "Final Examination",
            note: "",
            isHighlighted: true,
        },
        {
            dateText: "26 Aug 2026",
            dayText: "Wednesday",
            category: "Holiday",
            title: "Eid-e-Miladunnabi Holiday",
            note: "Subject to the appearance of the moon",
            isHighlighted: true,
        },
        {
            dateText: "02 Sep 2026",
            dayText: "Wednesday",
            category: "Result",
            title: "Deadline of submission of Final Grade",
            note: "",
            isHighlighted: false,
        },
        {
            dateText: "03 Sep 2026",
            dayText: "Thursday",
            category: "Exam",
            title:
                "Deadline of submission of application for Supplementary Final Examination along with fee Tk. 200 per course",
            note: "",
            isHighlighted: false,
        },
        {
            dateText: "03 Sep 2026",
            dayText: "Thursday",
            category: "Result",
            title: "Final Results publication",
            note: "",
            isHighlighted: false,
        },
        {
            dateText: "04 Sep 2026",
            dayText: "Friday",
            category: "Holiday",
            title: "Janmashtami Holiday and Semester break",
            note: "",
            isHighlighted: true,
        },
        {
            dateText: "05 Sep 2026",
            dayText: "Saturday",
            category: "Class",
            title: "Orientation and commencement of classes of Fall – 2026",
            note: "",
            isHighlighted: false,
        },
        {
            dateText: "13 Sep – 17 Sep 2026",
            dayText: "Sunday – Thursday",
            category: "Exam",
            title: "Supplementary Final Examination",
            note: "",
            isHighlighted: true,
        },
    ],
    summaries: [
        {
            type: "Class",
            title: "Total number of classes",
            dateText: "7 + 7 = 14 weeks",
        },
        {
            type: "Class",
            title: "Total class hours for a 3-credit theory course",
            dateText: "14 × 2 × 90 = 2520 minutes",
        },
        {
            type: "Exam",
            title: "Midterm Examination",
            dateText: "25 June – 03 July 2026",
        },
        {
            type: "Exam",
            title: "Supplementary Midterm Examination",
            dateText: "15 July – 19 July 2026",
        },
        {
            type: "Exam",
            title: "Final Examination",
            dateText: "22 Aug – 30 Aug 2026",
        },
        {
            type: "Exam",
            title: "Supplementary Final Examination",
            dateText: "13 Sep – 17 Sep 2026",
        },
        {
            type: "Payment",
            title: "1st Installment Fees without late fee",
            dateText: "06 May – 22 May 2026",
        },
        {
            type: "Payment",
            title: "Confirmation of registration with late fee",
            dateText: "01 June – 04 June 2026",
        },
        {
            type: "Payment",
            title: "2nd Installment at least 50% of total dues",
            dateText: "10 June – 24 June 2026",
        },
        {
            type: "Payment",
            title: "Final Installment without late fee",
            dateText: "06 Aug – 19 Aug 2026",
        },
        {
            type: "Payment",
            title: "Final Installment with late fee",
            dateText: "20 Aug – 24 Aug 2026",
        },
    ],
};

export default function AcademicCalendarManagePage() {
    const navigate = useNavigate();

    const [title, setTitle] = useState("Academic Calendar: Summer 2026");
    const [semester, setSemester] = useState("Summer 2026");
    const [academicYear, setAcademicYear] = useState("2026");
    const [sourceFileName, setSourceFileName] = useState("");
    const [events, setEvents] = useState([]);
    const [summaries, setSummaries] = useState([]);
    const [processing, setProcessing] = useState(false);
    const [rawText, setRawText] = useState("");
    const [jsonInput, setJsonInput] = useState("");
    const [showJsonBox, setShowJsonBox] = useState(false);

    useEffect(() => {
        loadExistingCalendar();
    }, []);

    const loadExistingCalendar = async () => {
        try {
            const data = await academicCalendarService.getLatest();

            if (data.calendar) {
                setTitle(data.calendar.title || "Academic Calendar");
                setSemester(data.calendar.semester || "");
                setAcademicYear(data.calendar.academicYear || "");
                setSourceFileName(data.calendar.sourceFileName || "");
                setEvents(Array.isArray(data.calendar.events) ? data.calendar.events : []);
                setSummaries(Array.isArray(data.calendar.summaries) ? data.calendar.summaries : []);
            }
        } catch (error) {
            console.error("Load academic calendar error:", error);
        }
    };

    const extractPdfTextByOcr = async (file) => {
        setProcessing(true);
        setSourceFileName(file.name);

        let worker = null;

        try {
            const arrayBuffer = await file.arrayBuffer();

            const pdf = await pdfjsLib.getDocument({
                data: new Uint8Array(arrayBuffer),
            }).promise;

            worker = await createWorker("eng");

            let allText = "";

            for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
                const page = await pdf.getPage(pageNo);
                const imageBlob = await renderPdfPageToImageBlob(page);
                const result = await worker.recognize(imageBlob);

                allText += `\n\n--- PAGE ${pageNo} ---\n`;
                allText += result?.data?.text || "";
            }

            const cleaned = cleanOcrText(allText);
            setRawText(cleaned);

            const parsed = parseCalendarRows(cleaned);

            setEvents(parsed.events);
            setSummaries(parsed.summaries);

            if (parsed.events.length === 0) {
                Swal.fire({
                    icon: "warning",
                    title: "OCR completed but no rows detected",
                    text: "The PDF was read, but rows could not be detected properly. Use the JSON import box or add rows manually.",
                });
                return;
            }

            Swal.fire({
                icon: "success",
                title: "PDF processed",
                text: `${parsed.events.length} calendar rows were detected. Please review and edit before saving.`,
            });
        } catch (error) {
            console.error("Academic calendar OCR failed:", error);

            Swal.fire({
                icon: "error",
                title: "OCR failed",
                text:
                    error?.message ||
                    "The PDF could not be processed. Use the JSON import option below.",
            });
        } finally {
            if (worker) {
                await worker.terminate();
            }

            setProcessing(false);
        }
    };

    const updateEvent = (index, field, value) => {
        setEvents((prev) =>
            prev.map((item, i) => {
                if (i !== index) return item;

                const updated = {
                    ...item,
                    [field]: value,
                };

                if (field === "title") {
                    updated.category = detectCategory(value);
                }

                return updated;
            })
        );
    };

    const addEvent = () => {
        setEvents((prev) => [
            ...prev,
            {
                dateText: "",
                dayText: "",
                category: "Other",
                title: "",
                note: "",
                isHighlighted: false,
            },
        ]);
    };

    const removeEvent = (index) => {
        setEvents((prev) => prev.filter((_, i) => i !== index));
    };

    const moveEvent = (index, direction) => {
        setEvents((prev) => {
            const next = [...prev];
            const targetIndex = direction === "up" ? index - 1 : index + 1;

            if (targetIndex < 0 || targetIndex >= next.length) return next;

            [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
            return next;
        });
    };

    const addSummary = () => {
        setSummaries((prev) => [
            ...prev,
            {
                type: "Other",
                title: "",
                dateText: "",
            },
        ]);
    };

    const updateSummary = (index, field, value) => {
        setSummaries((prev) =>
            prev.map((item, i) =>
                i === index
                    ? {
                        ...item,
                        [field]: value,
                    }
                    : item
            )
        );
    };

    const removeSummary = (index) => {
        setSummaries((prev) => prev.filter((_, i) => i !== index));
    };

    const loadEmptyJsonTemplate = () => {
        setJsonInput(JSON.stringify(EMPTY_JSON_TEMPLATE, null, 2));
        setShowJsonBox(true);
    };

    const loadSampleJson = () => {
        setJsonInput(JSON.stringify(SAMPLE_ACADEMIC_CALENDAR_JSON, null, 2));
        setShowJsonBox(true);
    };

    const fillCalendarFromJson = () => {
        try {
            const parsed = JSON.parse(jsonInput);

            if (!parsed || typeof parsed !== "object") {
                throw new Error("Invalid JSON object.");
            }

            if (!Array.isArray(parsed.events)) {
                throw new Error("JSON must contain an events array.");
            }

            const cleanedEvents = parsed.events
                .filter((event) => event && typeof event === "object")
                .map((event) => {
                    const eventTitle = String(event.title || "").trim();
                    const categoryFromJson = String(event.category || "").trim();

                    return {
                        dateText: String(event.dateText || "").trim(),
                        dayText: String(event.dayText || "").trim(),
                        category: CATEGORIES.includes(categoryFromJson)
                            ? categoryFromJson
                            : detectCategory(eventTitle),
                        title: eventTitle,
                        note: String(event.note || "").trim(),
                        isHighlighted: Boolean(event.isHighlighted),
                    };
                })
                .filter((event) => event.dateText || event.title);

            const cleanedSummaries = Array.isArray(parsed.summaries)
                ? parsed.summaries
                    .filter((item) => item && typeof item === "object")
                    .map((item) => {
                        const summaryType = String(item.type || "").trim();

                        return {
                            type: SUMMARY_TYPES.includes(summaryType) ? summaryType : "Other",
                            title: String(item.title || "").trim(),
                            dateText: String(item.dateText || "").trim(),
                        };
                    })
                    .filter((item) => item.title || item.dateText)
                : [];

            setTitle(parsed.title || title);
            setSemester(parsed.semester || semester);
            setAcademicYear(parsed.academicYear || academicYear);
            setEvents(cleanedEvents);
            setSummaries(cleanedSummaries);

            Swal.fire({
                icon: "success",
                title: "JSON imported",
                text: `${cleanedEvents.length} calendar rows and ${cleanedSummaries.length} summary rows were loaded.`,
            });
        } catch (error) {
            Swal.fire({
                icon: "error",
                title: "Invalid JSON",
                text: error?.message || "Please check your JSON format.",
            });
        }
    };

    const copyCurrentAsJson = async () => {
        const currentJson = {
            title,
            semester,
            academicYear,
            events,
            summaries,
        };

        const formatted = JSON.stringify(currentJson, null, 2);
        setJsonInput(formatted);
        setShowJsonBox(true);

        try {
            await navigator.clipboard.writeText(formatted);

            Swal.fire({
                icon: "success",
                title: "Copied",
                text: "Current calendar JSON has been copied to clipboard.",
                timer: 1600,
                showConfirmButton: false,
            });
        } catch {
            Swal.fire({
                icon: "info",
                title: "JSON generated",
                text: "Current calendar JSON is shown in the JSON box.",
            });
        }
    };

    const clearAllRows = () => {
        Swal.fire({
            icon: "warning",
            title: "Clear all rows?",
            text: "This will remove all calendar events and summary information from this page.",
            showCancelButton: true,
            confirmButtonText: "Yes, clear",
            cancelButtonText: "Cancel",
        }).then((result) => {
            if (result.isConfirmed) {
                setEvents([]);
                setSummaries([]);
            }
        });
    };

    const saveCalendar = async () => {
        try {
            const cleanedEvents = events
                .map((event, index) => ({
                    dateText: String(event.dateText || "").trim(),
                    dayText: String(event.dayText || "").trim(),
                    category: CATEGORIES.includes(event.category) ? event.category : "Other",
                    title: String(event.title || "").trim(),
                    note: String(event.note || "").trim(),
                    isHighlighted: Boolean(event.isHighlighted),
                    sortOrder: index,
                }))
                .filter((event) => event.dateText && event.title);

            const cleanedSummaries = summaries
                .map((item) => ({
                    type: SUMMARY_TYPES.includes(item.type) ? item.type : "Other",
                    title: String(item.title || "").trim(),
                    dateText: String(item.dateText || "").trim(),
                }))
                .filter((item) => item.title || item.dateText);

            if (cleanedEvents.length === 0) {
                Swal.fire({
                    icon: "warning",
                    title: "No calendar rows",
                    text: "Please add at least one calendar event before saving.",
                });
                return;
            }

            const payload = {
                title,
                semester,
                academicYear,
                sourceFileName,
                events: cleanedEvents,
                summaries: cleanedSummaries,
                published: true,
            };

            await academicCalendarService.save(payload);

            Swal.fire({
                icon: "success",
                title: "Saved",
                text: "Academic calendar has been updated successfully.",
            });

            navigate("/academic-calendar");
        } catch (error) {
            console.error("Save academic calendar error:", error);

            Swal.fire({
                icon: "error",
                title: "Save failed",
                text:
                    error?.response?.data?.message ||
                    error?.response?.data?.error ||
                    error?.message ||
                    "Failed to save academic calendar.",
            });
        }
    };

    return (
        <div className="space-y-6">
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                        <p className="text-sm font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-300">
                            Calendar Setup
                        </p>

                        <h1 className="mt-1 text-2xl font-bold text-slate-950 dark:text-white">
                            Create / Update Academic Calendar
                        </h1>

                        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                            Upload PDF, import JSON, or manually add academic calendar rows. Review everything before saving.
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => navigate("/academic-calendar")}
                            className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                            View Calendar
                        </button>

                        <button
                            type="button"
                            onClick={saveCalendar}
                            className="rounded-2xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700"
                        >
                            Save Calendar
                        </button>
                    </div>
                </div>

                <div className="mt-6 grid gap-4 lg:grid-cols-3">
                    <div>
                        <label className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                            Calendar Title
                        </label>
                        <input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                        />
                    </div>

                    <div>
                        <label className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                            Semester
                        </label>
                        <input
                            value={semester}
                            onChange={(e) => setSemester(e.target.value)}
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                        />
                    </div>

                    <div>
                        <label className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                            Academic Year
                        </label>
                        <input
                            value={academicYear}
                            onChange={(e) => setAcademicYear(e.target.value)}
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                        />
                    </div>
                </div>

                <div className="mt-6 rounded-3xl border border-dashed border-violet-300 bg-violet-50/50 p-6 dark:border-violet-500/30 dark:bg-violet-500/10">
                    <label className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
                        Upload Academic Calendar PDF
                    </label>

                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        For scanned calendar PDFs, OCR will try to detect rows automatically. If it fails, use JSON import below.
                    </p>

                    <input
                        type="file"
                        accept="application/pdf"
                        disabled={processing}
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) extractPdfTextByOcr(file);
                        }}
                        className="mt-4 block w-full rounded-2xl border border-slate-200 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />

                    {processing && (
                        <p className="mt-3 text-sm font-semibold text-violet-700 dark:text-violet-300">
                            Processing PDF with OCR. Please wait...
                        </p>
                    )}

                    {sourceFileName && (
                        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                            Source file: {sourceFileName}
                        </p>
                    )}
                </div>

                <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-6 dark:border-slate-800 dark:bg-slate-950">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                            <h2 className="text-base font-bold text-slate-950 dark:text-white">
                                Import Calendar from JSON
                            </h2>

                            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                Use this when OCR fails. Paste JSON and click Fill Calendar from JSON.
                            </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={loadEmptyJsonTemplate}
                                className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                                JSON Format
                            </button>

                            <button
                                type="button"
                                onClick={loadSampleJson}
                                className="rounded-2xl border border-violet-200 bg-white px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50 dark:border-violet-500/30 dark:bg-slate-900 dark:text-violet-300 dark:hover:bg-violet-500/10"
                            >
                                Load BUBT Sample JSON
                            </button>

                            <button
                                type="button"
                                onClick={copyCurrentAsJson}
                                className="rounded-2xl border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-emerald-300 dark:hover:bg-emerald-500/10"
                            >
                                Copy Current JSON
                            </button>

                            <button
                                type="button"
                                onClick={() => setShowJsonBox((prev) => !prev)}
                                className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                                {showJsonBox ? "Hide JSON Box" : "Show JSON Box"}
                            </button>
                        </div>
                    </div>

                    {showJsonBox && (
                        <div className="mt-5 space-y-4">
                            <textarea
                                value={jsonInput}
                                onChange={(e) => setJsonInput(e.target.value)}
                                rows={18}
                                placeholder={JSON.stringify(EMPTY_JSON_TEMPLATE, null, 2)}
                                className="w-full rounded-2xl border border-slate-200 bg-white p-4 font-mono text-xs text-slate-800 outline-none focus:border-violet-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                            />

                            <div className="flex flex-wrap justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setJsonInput("")}
                                    className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                                >
                                    Clear JSON
                                </button>

                                <button
                                    type="button"
                                    onClick={fillCalendarFromJson}
                                    className="rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
                                >
                                    Fill Calendar from JSON
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <h2 className="text-lg font-bold text-slate-950 dark:text-white">
                            Calendar Events
                        </h2>

                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            Edit detected/imported rows or add missing rows manually.
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={clearAllRows}
                            className="rounded-2xl border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-500/30 dark:bg-slate-950 dark:text-rose-300 dark:hover:bg-rose-500/10"
                        >
                            Clear All
                        </button>

                        <button
                            type="button"
                            onClick={addEvent}
                            className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                            Add Row
                        </button>
                    </div>
                </div>

                <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                    <table className="min-w-[1220px] w-full text-left text-sm">
                        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                            <tr>
                                <th className="px-4 py-3">Date</th>
                                <th className="px-4 py-3">Day</th>
                                <th className="px-4 py-3">Category</th>
                                <th className="px-4 py-3">Activity / Holiday</th>
                                <th className="px-4 py-3">Note</th>
                                <th className="px-4 py-3">Highlight</th>
                                <th className="px-4 py-3">Order</th>
                                <th className="px-4 py-3">Action</th>
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                            {events.map((event, index) => (
                                <tr key={index} className="bg-white dark:bg-slate-900">
                                    <td className="px-4 py-3">
                                        <input
                                            value={event.dateText}
                                            onChange={(e) => updateEvent(index, "dateText", e.target.value)}
                                            className="w-48 rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-violet-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                                        />
                                    </td>

                                    <td className="px-4 py-3">
                                        <input
                                            value={event.dayText}
                                            onChange={(e) => updateEvent(index, "dayText", e.target.value)}
                                            className="w-40 rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-violet-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                                        />
                                    </td>

                                    <td className="px-4 py-3">
                                        <select
                                            value={event.category || "Other"}
                                            onChange={(e) => updateEvent(index, "category", e.target.value)}
                                            className="w-40 rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-violet-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                                        >
                                            {CATEGORIES.map((category) => (
                                                <option key={category} value={category}>
                                                    {category}
                                                </option>
                                            ))}
                                        </select>
                                    </td>

                                    <td className="px-4 py-3">
                                        <textarea
                                            value={event.title}
                                            onChange={(e) => updateEvent(index, "title", e.target.value)}
                                            rows={2}
                                            className="w-96 rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-violet-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                                        />
                                    </td>

                                    <td className="px-4 py-3">
                                        <input
                                            value={event.note || ""}
                                            onChange={(e) => updateEvent(index, "note", e.target.value)}
                                            className="w-56 rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-violet-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                                        />
                                    </td>

                                    <td className="px-4 py-3">
                                        <input
                                            type="checkbox"
                                            checked={Boolean(event.isHighlighted)}
                                            onChange={(e) =>
                                                updateEvent(index, "isHighlighted", e.target.checked)
                                            }
                                            className="h-5 w-5"
                                        />
                                    </td>

                                    <td className="px-4 py-3">
                                        <div className="flex gap-1">
                                            <button
                                                type="button"
                                                onClick={() => moveEvent(index, "up")}
                                                disabled={index === 0}
                                                className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
                                            >
                                                Up
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => moveEvent(index, "down")}
                                                disabled={index === events.length - 1}
                                                className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
                                            >
                                                Down
                                            </button>
                                        </div>
                                    </td>

                                    <td className="px-4 py-3">
                                        <button
                                            type="button"
                                            onClick={() => removeEvent(index)}
                                            className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-300"
                                        >
                                            Remove
                                        </button>
                                    </td>
                                </tr>
                            ))}

                            {events.length === 0 && (
                                <tr>
                                    <td
                                        colSpan={8}
                                        className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400"
                                    >
                                        No rows found. Upload a PDF, import JSON, or add rows manually.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <h2 className="text-lg font-bold text-slate-950 dark:text-white">
                            Extra Summary Information
                        </h2>

                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            Add exam schedule, payment schedule, class summary, or other important notes.
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={addSummary}
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                        Add Summary
                    </button>
                </div>

                <div className="mt-5 grid gap-4">
                    {summaries.map((item, index) => (
                        <div
                            key={index}
                            className="grid gap-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-800 lg:grid-cols-[160px_1fr_220px_auto]"
                        >
                            <select
                                value={item.type || "Other"}
                                onChange={(e) => updateSummary(index, "type", e.target.value)}
                                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                            >
                                {SUMMARY_TYPES.map((type) => (
                                    <option key={type} value={type}>
                                        {type}
                                    </option>
                                ))}
                            </select>

                            <input
                                value={item.title}
                                onChange={(e) => updateSummary(index, "title", e.target.value)}
                                placeholder="Summary title"
                                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                            />

                            <input
                                value={item.dateText}
                                onChange={(e) => updateSummary(index, "dateText", e.target.value)}
                                placeholder="Date"
                                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                            />

                            <button
                                type="button"
                                onClick={() => removeSummary(index)}
                                className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-300"
                            >
                                Remove
                            </button>
                        </div>
                    ))}

                    {summaries.length === 0 && (
                        <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                            No summary information added yet.
                        </div>
                    )}
                </div>
            </section>

            {rawText && (
                <details className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <summary className="cursor-pointer text-sm font-semibold text-slate-700 dark:text-slate-200">
                        View OCR Raw Text
                    </summary>

                    <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">
                        {rawText}
                    </pre>
                </details>
            )}
        </div>
    );
}