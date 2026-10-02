export interface LayoutBlock<T> { rows: readonly T[]; heights: readonly number[]; keepWithNext?: readonly boolean[] }
export interface Placement<T> { row: T; page: number; y: number }

/** Whole blocks move first. Oversized blocks split with the first two rows kept together. */
export function paginate<T>(blocks: readonly LayoutBlock<T>[], top = 20, bottom = 277): Placement<T>[] {
  const result: Placement<T>[] = [];
  let page = 0, y = top;
  const capacity = bottom - top;
  for (const block of blocks) {
    if (block.rows.length !== block.heights.length || block.heights.some((h) => !Number.isFinite(h) || h <= 0 || h > capacity)) {
      throw new Error('Invalid PDF layout row');
    }
    const height = block.heights.reduce((a, b) => a + b, 0);
    const lead = (block.heights[0] ?? 0) + (block.heights[1] ?? 0);
    if (y > top && ((height <= capacity && y + height > bottom) || y + lead > bottom)) { page++; y = top; }
    block.rows.forEach((row, i) => {
      const h = block.heights[i]!;
      // The last two rows stay together (e.g. a price and its item total).
      let remaining = i === block.rows.length - 2 ? h + block.heights[i + 1]! : h;
      if (block.keepWithNext?.[i]) {
        remaining = h;
        for (let next = i + 1; next < block.rows.length; next++) {
          remaining += block.heights[next]!;
          if (!block.keepWithNext[next]) break;
        }
      }
      // A wrapped heading/text longer than a page must itself be allowed to split.
      if (remaining > capacity) remaining = h;
      if (y > top && y + remaining > bottom) { page++; y = top; }
      result.push({ row, page, y }); y += h;
    });
    y += 5;
  }
  return result;
}
