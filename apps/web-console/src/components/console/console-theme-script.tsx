/** Runs before paint to avoid theme flash on console routes. */
export function ConsoleThemeScript() {
  const script = `(function(){try{var k="salanor.console.theme";var s=localStorage.getItem(k);var d=s==="dark"||(s!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;
  return (
    <script dangerouslySetInnerHTML={{ __html: script }} />
  );
}
