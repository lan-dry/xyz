export function AdminThemeScript() {
  const script = `(function(){try{var k="salanor.console.theme";var s=localStorage.getItem(k);var d=s==="dark"||(s!=="light"&&(s==="system"||!s)&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;
  return (
    <script
      dangerouslySetInnerHTML={{ __html: script }}
      suppressHydrationWarning
    />
  );
}
