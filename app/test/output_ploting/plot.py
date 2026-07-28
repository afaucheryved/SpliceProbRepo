import ast
import re
from pathlib import Path

import matplotlib.pyplot as plt
from matplotlib.lines import Line2D
from matplotlib.patches import Patch

INPUT_FILE = Path(__file__).resolve().parent.parent / "output" / "output_rubber_window.txt"
OUTPUT_DIR = Path(__file__).resolve().parent
OUTPUT_FILE = OUTPUT_DIR / "donor_acceptor_windows.png"
ANALYSIS_FILE = Path(__file__).resolve().parent.parent / "output_analysis" / "output_analysis.txt"

PAIR_LINE = re.compile(r"^\((\d+),\s*(\d+)\):\s*(\{.*\})$")
EXON_LINE = re.compile(r"^exon:\s*\((\d+),\s*(\d+)\)$")
FLOAT32_WRAPPER = re.compile(r"np\.float32\(([^)]+)\)")

COLORS = {"donor": "#7C8FC4", "acceptor": "#D9A6E0"}
EXON_COLORS = {"start": "#2563eb", "end": "#059669"}

BAR_HEIGHT = 0.6
ROW_HEIGHT = 2.4  # tall enough to fit the boundary numbers + subsequence label above each bar
GROUP_GAP_ROWS = 1  # empty rows separating the donor block from the acceptor block
BOUNDARY_LABEL_GAP_FRACTION = 0.006  # gap between a bracket line and its number, as a fraction of the sequence length
##tempo, delet
baseprob_donor = 0.0385
baseprob_acceptor = 0.954
##


def parse_output_file(path: Path) -> tuple[int, tuple[int, int] | None, dict[tuple[int, int], dict]]:
    """Parse a rubber_window output file into (sequence_length, exon, {(start, end): {"donor": float, "acceptor": float, "subsequence": str}})."""
    entries: dict[tuple[int, int], dict] = {}
    with open(path, "r") as f:
        lines = f.readlines()

    sequence_length = int(lines[0].strip())
    exon: tuple[int, int] | None = None

    for line in lines[1:]:
        line = line.strip()
        if not line:
            continue
        exon_match = EXON_LINE.match(line)
        if exon_match:
            exon = (int(exon_match.group(1)), int(exon_match.group(2)))
            continue
        match = PAIR_LINE.match(line)
        if not match:
            continue
        start, end, dict_str = match.groups()
        dict_str = FLOAT32_WRAPPER.sub(r"\1", dict_str)
        values = ast.literal_eval(dict_str)
        entries[(int(start), int(end))] = values
        ## ponderation, delet
        values["donor"]/=baseprob_donor
        values["acceptor"]/=baseprob_acceptor
        ##
    return sequence_length, exon, entries


def top_n_by_impact(entries: dict[tuple[int, int], dict], key: str, n: int = 10) -> list[tuple[tuple[int, int], dict]]:
    """Return the n entries whose `key` value has the largest magnitude, largest first."""
    return sorted(entries.items(), key=lambda item: abs(item[1][key]), reverse=True)[:n]


def build_segments(entries: dict[tuple[int, int], dict], key: str, n: int = 10) -> list[dict]:
    top = top_n_by_impact(entries, key, n)
    return [
        {
            "start": start,
            "end": end,
            "value": values[key],
            "subsequence": values["subsequence"],
            "type": key,
        }
        for (start, end), values in top
    ]


def assign_ranked_rows(donor_segments: list[dict], acceptor_segments: list[dict]) -> int:
    """Give every segment its own row, ranked strongest-first within its group (in-place `row` key). Returns total row count."""
    for idx, seg in enumerate(donor_segments):
        seg["row"] = idx
    offset = len(donor_segments) + GROUP_GAP_ROWS
    for idx, seg in enumerate(acceptor_segments):
        seg["row"] = offset + idx
    return offset + len(acceptor_segments)


def plot_combined(donor_segments: list[dict], acceptor_segments: list[dict], sequence_length: int, exon: tuple[int, int] | None, output_path: Path) -> None:
    total_rows = assign_ranked_rows(donor_segments, acceptor_segments)
    fig, ax = plt.subplots(figsize=(14, max(6, total_rows * 0.7)))

    label_gap = sequence_length * BOUNDARY_LABEL_GAP_FRACTION

    for seg in donor_segments + acceptor_segments:
        y0 = seg["row"] * ROW_HEIGHT
        y_top = y0 + BAR_HEIGHT
        y_mid = (y0 + y_top) / 2
        color = COLORS[seg["type"]]
        width = seg["end"] - seg["start"]

        ax.broken_barh([(seg["start"], width)], (y0, BAR_HEIGHT), facecolors=color, edgecolors="black", linewidth=0.5)
        # subsequence above the bar, value below it: kept on their own rows (rather than
        # centered on the bar itself) so that neither collides with the boundary numbers
        # flanking the bar, even when the segment is only a few bases wide and the labels
        # are visually much wider than the bar.
        ax.text((seg["start"] + seg["end"]) / 2, y0 - 0.15, seg["subsequence"], ha="center", va="bottom", fontsize=7)
        ax.text((seg["start"] + seg["end"]) / 2, y_top + 0.3, f"{seg['value']:.2e}", ha="center", va="top", fontsize=8, fontweight="bold")

        # boundary ticks at start/end, marking the exact window edges. The numbers sit
        # outside the bar (start to its left, end to its right) so they never collide
        # with each other, no matter how narrow the segment is.
        ax.plot([seg["start"], seg["start"]], [y0 - 0.1, y_top + 0.1], color="black", linewidth=1, linestyle=":")
        ax.plot([seg["end"], seg["end"]], [y0 - 0.1, y_top + 0.1], color="black", linewidth=1, linestyle=":")
        ax.text(seg["start"] - label_gap, y_mid, str(seg["start"]), ha="right", va="center", fontsize=11, color="black", fontweight="bold")
        ax.text(seg["end"] + label_gap, y_mid, str(seg["end"]), ha="left", va="center", fontsize=11, color="black", fontweight="bold")

    ax.get_yaxis().set_visible(False)
    for spine in ax.spines.values():
        spine.set_visible(False)
    ax.set_xlim(0, sequence_length)
    ax.set_ylim(total_rows * ROW_HEIGHT + 0.5, -1.5)  # rank 1 (strongest) at the top of each group
    ax.set_title("Top 10 donor and top 10 acceptor windows by score magnitude")
    ax.set_xlabel("Sequence position")

    # hand-drawn-style axes: arrows instead of plain spines
    ax.annotate("", xy=(1, 0), xytext=(0, 0), xycoords="axes fraction", arrowprops=dict(arrowstyle="-|>", color="black", lw=1.5))
    ax.annotate("", xy=(0, 1), xytext=(0, 0), xycoords="axes fraction", arrowprops=dict(arrowstyle="-|>", color="black", lw=1.5))
    ax.tick_params(axis="x", length=4)

    legend_handles = [Patch(facecolor=COLORS["acceptor"], edgecolor="black", label="acceptor"), Patch(facecolor=COLORS["donor"], edgecolor="black", label="donor")]

    if exon is not None:
        ax.axvline(exon[0], color=EXON_COLORS["start"], linestyle="--", linewidth=1.5, zorder=0)
        ax.axvline(exon[1], color=EXON_COLORS["end"], linestyle="--", linewidth=1.5, zorder=0)
        legend_handles += [
            Line2D([0], [0], color=EXON_COLORS["start"], linestyle="--", linewidth=1.5, label="exon start (acceptor site)"),
            Line2D([0], [0], color=EXON_COLORS["end"], linestyle="--", linewidth=1.5, label="exon end (donor site)"),
        ]

    fig.legend(handles=legend_handles, loc="upper right", bbox_to_anchor=(0.98, 0.98))

    fig.tight_layout()
    fig.savefig(output_path, dpi=150)
    plt.close(fig)


def write_segments_txt(donor_segments: list[dict], acceptor_segments: list[dict], sequence_length: int, output_path: Path) -> None:
    """Write the same top-N donor/acceptor windows shown in the plot as tab-separated rows, for reuse by other analyses."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        f.write(f"# sequence_length: {sequence_length}\n")
        f.write("# type\trank\tstart\tend\tvalue\tsubsequence\n")
        for segments in (donor_segments, acceptor_segments):
            for rank, seg in enumerate(segments, start=1):
                f.write(f"{seg['type']}\t{rank}\t{seg['start']}\t{seg['end']}\t{seg['value']:.6e}\t{seg['subsequence']}\n")


def main() -> None:
    sequence_length, exon, entries = parse_output_file(INPUT_FILE)

    donor_segments = build_segments(entries, "donor", n=10)
    acceptor_segments = build_segments(entries, "acceptor", n=10)

    plot_combined(donor_segments, acceptor_segments, sequence_length, exon, OUTPUT_FILE)
    write_segments_txt(donor_segments, acceptor_segments, sequence_length, ANALYSIS_FILE)

    print(f"Parsed {len(entries)} windows from {INPUT_FILE}")
    print(f"Saved combined donor/acceptor plot -> {OUTPUT_FILE}")
    print(f"Saved donor/acceptor analysis text -> {ANALYSIS_FILE}")


if __name__ == "__main__":
    main()
