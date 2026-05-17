# patch_chances.py
from pathlib import Path
from datetime import datetime
import shutil
import subprocess

INDEX_PATH = Path("src/index.js")


ADMIN_MANDOM_TIMELINE_FUNCTION = r'''
function adminRootMandomTimelineStatusV1() {
  const nl = String.fromCharCode(10);

  const candidates = [
    typeof MANDOM_CORE_TIMELINE_FILE_V2 !== "undefined"
      ? MANDOM_CORE_TIMELINE_FILE_V2
      : null,
    typeof MANDOM_CLEAN_TIMELINE_FILE_V1 !== "undefined"
      ? MANDOM_CLEAN_TIMELINE_FILE_V1
      : null,
    path.join(DATA_DIR, "mandom_clean_timeline.json"),
    path.join(DATA_DIR, "mandom_timeline.json")
  ].filter(Boolean);

  const timelineFile = candidates.find((filePath) => fs.existsSync(filePath)) || candidates[0];
  const windowMs = typeof MANDOM_CORE_WINDOW_MS_V2 !== "undefined"
    ? MANDOM_CORE_WINDOW_MS_V2
    : typeof MANDOM_CLEAN_WINDOW_MS_V1 !== "undefined"
      ? MANDOM_CLEAN_WINDOW_MS_V1
      : 4 * 60 * 1000;

  const maxSnapshots = typeof MANDOM_CORE_MAX_SNAPSHOTS_V2 !== "undefined"
    ? MANDOM_CORE_MAX_SNAPSHOTS_V2
    : typeof MANDOM_CLEAN_MAX_SNAPSHOTS_V1 !== "undefined"
      ? MANDOM_CLEAN_MAX_SNAPSHOTS_V1
      : 240;

  let snapshots = [];
  let readError = "";

  try {
    if (timelineFile && fs.existsSync(timelineFile)) {
      const parsed = JSON.parse(fs.readFileSync(timelineFile, "utf8"));
      snapshots = Array.isArray(parsed) ? parsed : [];
    }
  } catch (error) {
    readError = error.message;
    snapshots = [];
  }

  const now = Date.now();

  const validSnapshots = snapshots
    .filter((snapshot) => snapshot && Number(snapshot.at || 0) > 0 && snapshot.raw)
    .sort((a, b) => Number(a.at || 0) - Number(b.at || 0));

  const oldest = validSnapshots[0] || null;
  const newest = validSnapshots[validSnapshots.length - 1] || null;

  return [
    `⏪ *Mandom Timeline — ROOT*`,
    ``,
    `Arquivo:`,
    `> ${timelineFile ? timelineFile.replace(process.cwd() + path.sep, "") : "não definido"}`,
    ``,
    `Snapshots válidos: *${validSnapshots.length}*`,
    `Snapshots brutos: *${snapshots.length}*`,
    `Limite máximo: *${maxSnapshots}*`,
    `Janela de rewind: *${formatDurationCompact(windowMs)}*`,
    ``,
    `Mais antigo:`,
    `> ${oldest ? `${formatDurationCompact(now - Number(oldest.at || now))} atrás` : "Nenhum"}`,
    ``,
    `Mais recente:`,
    `> ${newest ? `${formatDurationCompact(now - Number(newest.at || now))} atrás` : "Nenhum"}`,
    ``,
    `Status:`,
    `> ${validSnapshots.length ? "Timeline pronta para rebobinar ações salvas." : "Ainda sem snapshots."}`,
    readError ? `` : null,
    readError ? `Erro de leitura:` : null,
    readError ? `> ${readError}` : null
  ].filter((line) => line !== null).join(nl);
}
'''


def run_node_check():
    result = subprocess.run(
        ["node", "--check", str(INDEX_PATH)],
        capture_output=True,
        text=True,
        timeout=30,
    )
    output = (result.stdout or "") + (result.stderr or "")
    return result.returncode == 0, output.strip()


def find_matching_brace(text, open_index):
    depth = 0
    i = open_index
    state = "code"

    while i < len(text):
        char = text[i]
        nxt = text[i + 1] if i + 1 < len(text) else ""

        if state == "code":
            if char == "/" and nxt == "/":
                state = "line_comment"
                i += 2
                continue
            if char == "/" and nxt == "*":
                state = "block_comment"
                i += 2
                continue
            if char == "'":
                state = "single"
                i += 1
                continue
            if char == '"':
                state = "double"
                i += 1
                continue
            if char == "`":
                state = "template"
                i += 1
                continue
            if char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    return i

        elif state == "line_comment":
            if char == "\n":
                state = "code"

        elif state == "block_comment":
            if char == "*" and nxt == "/":
                state = "code"
                i += 2
                continue

        elif state == "single":
            if char == "\\":
                i += 2
                continue
            if char == "'":
                state = "code"

        elif state == "double":
            if char == "\\":
                i += 2
                continue
            if char == '"':
                state = "code"

        elif state == "template":
            if char == "\\":
                i += 2
                continue
            if char == "`":
                state = "code"

        i += 1

    return -1


def replace_or_insert_admin_function(text):
    signature = "function adminRootMandomTimelineStatusV1"
    start = text.find(signature)

    if start != -1:
        open_brace = text.find("{", start)
        close_brace = find_matching_brace(text, open_brace)

        if open_brace == -1 or close_brace == -1:
            raise RuntimeError("Não consegui delimitar adminRootMandomTimelineStatusV1.")

        print("[ok] adminRootMandomTimelineStatusV1 substituída.")
        return text[:start] + ADMIN_MANDOM_TIMELINE_FUNCTION + text[close_brace + 1:]

    markers = [
        "// MANDOM_CORE_CLEAN_V2_END",
        "// MANDOM_CLEAN_REWORK_V1_END",
        "async function handleStandActivate",
        "async function handleAdmin",
        "client.on(\"message",
        "client.on('message",
    ]

    for marker in markers:
        pos = text.find(marker)

        if pos != -1:
            if marker.startswith("//"):
                insert_at = pos + len(marker)
                print("[ok] adminRootMandomTimelineStatusV1 inserida após bloco do Mandom.")
                return text[:insert_at] + "\n\n" + ADMIN_MANDOM_TIMELINE_FUNCTION + "\n" + text[insert_at:]

            print(f"[ok] adminRootMandomTimelineStatusV1 inserida antes de {marker}.")
            return text[:pos] + ADMIN_MANDOM_TIMELINE_FUNCTION + "\n\n" + text[pos:]

    raise RuntimeError("Não encontrei ponto seguro para inserir adminRootMandomTimelineStatusV1.")


def main():
    if not INDEX_PATH.exists():
        raise FileNotFoundError(f"Arquivo não encontrado: {INDEX_PATH}")

    text = INDEX_PATH.read_text(encoding="utf-8")

    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_path = INDEX_PATH.with_name(f"index.backup-admin-mandom-timeline-fix-{timestamp}.js")
    shutil.copy2(INDEX_PATH, backup_path)

    text = replace_or_insert_admin_function(text)

    INDEX_PATH.write_text(text, encoding="utf-8")

    ok, output = run_node_check()

    print(f"\nBackup criado em: {backup_path}")

    if not ok:
        shutil.copy2(backup_path, INDEX_PATH)
        print("[erro] O patch quebrou a sintaxe. Restaurei o backup automaticamente.")
        print(output)
        return

    print("[ok] node --check passou.")
    print("Agora rode:")
    print("node .\\src\\index.js")


if __name__ == "__main__":
    main()
