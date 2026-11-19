// MapLibre builds its fallback worker URL with `new URL(`./${name}`, import.meta.url)`.
// Turbopack reads that as a pattern over maplibre-gl/dist and copies every file in it,
// the development builds included (about 3.8 MB), into the production output. The app
// sets the worker URL itself (src/shared/map/map-view.tsx), so that fallback never runs;
// calling URL through globalThis keeps it out of the analysis and runs the same code.
/** @param {string} source @returns {string} */
export default function maplibreUrlLoader(source) {
  return source.replaceAll('new URL(', 'new globalThis.URL(');
}
