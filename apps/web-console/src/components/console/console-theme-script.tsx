/** Runs before paint to avoid theme flash on console routes. */
export function ConsoleThemeScript() {
  const bankDemo = process.env.NEXT_PUBLIC_AEGIS_UI_PROFILE === "bank_demo";
  const script = `(function(){try{var k="salanor.console.theme";var s=localStorage.getItem(k);var d=s==="dark"||(s!=="light"&&!${bankDemo}&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;
  return (
    <script dangerouslySetInnerHTML={{ __html: script }} />
  );
}
