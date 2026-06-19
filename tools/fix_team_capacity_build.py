from pathlib import Path

path = Path("holifriday-app/src/App.tsx")
text = path.read_text(encoding="utf-8")

start = text.find("function TeamScheduleView({ board, onOpen }: any) {")
end = text.find("function PMPlanningView(", start)

if start == -1:
    raise SystemExit("Cannot find TeamScheduleView")
if end == -1:
    raise SystemExit("Cannot find PMPlanningView after TeamScheduleView")

before = text[:start]
block = text[start:end]
after = text[end:]

# The previous patch accidentally renamed TeamScheduleView capacity state.
# TeamScheduleView still needs the local capacity/setCapacity state.
block = block.replace(
    "  const [fallbackCapacity, setFallbackCapacity] = useState(6);",
    "  const [capacity, setCapacity] = useState(6);",
    1,
)

text = before + block + after
path.write_text(text, encoding="utf-8")
print("Fixed TeamScheduleView capacity state.")
