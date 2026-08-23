/** @type {import('tailwindcss').Config} */
module.exports = {
  // OJO: no alcanza con los .html. Media UI de la app (la pantalla de
  // batalla en game-engine.js, el bracket de torneos, el panel de
  // reclamos, etc.) se arma con innerHTML en JS, no vive en el markup
  // estatico de index.html. Si el content no escanea esos .js, Tailwind
  // nunca genera esas clases y quedan sin CSS -- exactamente lo que paso
  // el 2026-08-23 con la pantalla de batalla (h-[300px], w-56, etc. no
  // existian en el build, el contenedor colapsaba a 0 de alto).
  content: ['./*.html', './*.js', './src/**/*.js'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] }
    }
  },
  plugins: []
};
