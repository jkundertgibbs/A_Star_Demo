# A_Star_Demo
A quick, interactive demo of the a* algorithm.


/**
 * A* Pathfinding Demo (16:9) — React Canvas
 * Author/Credit: John L. Gibbs ("Dr. Know It All") — https://www.youtube.com/@DrKnowItAll
 * Please keep this header if you share or modify the code.
 *
 * ▶ How to run locally (Vite + Tailwind, recommended)
 * 1) npm create vite@latest a-star-demo -- --template react
 * 2) cd a-star-demo && npm i
 * 3) npm i -D tailwindcss postcss autoprefixer && npx tailwindcss init -p
 * 4) In tailwind.config.js set:
 *    content: ["./index.html","./src/**/*.{js,ts,jsx,tsx}"]
 * 5) In src/index.css add (at the very top):
 *      @tailwind base;
 * @tailwind components;
 * @tailwind utilities;
 * 6) Save THIS file as src/AStarPathfindingDemo.jsx
 * 7) Replace src/App.jsx with:
 *      import Demo from "./AStarPathfindingDemo.jsx";
export default function App(){ return <Demo/> }
 * 8) npm run dev  → open http://localhost:5173/
 *
 * 💡 Alternate: you can run without Tailwind; it will still function but look plain.
 *
 * Controls: Play/Pause • Step • Reset • Regenerate • Speed • Obstacle density • Seed • Grid size • Guarantee solvable
 * Algorithm: 4-way moves, g=1 per move, h = Manhattan (L1), ties broken on lower h.
 * Self-tests: basic assertions run once on mount (open DevTools console).
 */
