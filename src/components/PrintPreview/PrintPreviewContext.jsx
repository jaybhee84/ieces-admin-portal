import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import PrintPreviewModal from "./PrintPreviewModal";
import { hasPrintableContent } from "./printable";

// Print preview shared with SwiSS and Tax-E. A screen calls requestPrint()
// instead of window.print(), and Ctrl+P opens the same dialog. Whatever the
// page's print CSS shows for its [data-print-root] is what gets previewed and
// printed; this provider does not need to know which screen is active.
const PrintPreviewContext = createContext(null);

export function PrintPreviewProvider({ children }) {
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  openRef.current = open;
  const onCloseRef = useRef(null);

  // Optional { onClose } lets a screen that mounts its print root only for
  // printing take it down again once the dialog closes. Callers that pass the
  // click event straight through (onClick={requestPrint}) are unaffected.
  const requestPrint = useCallback((options) => {
    // Outside the desktop app (a plain browser) there is no preview bridge
    if (!window.ipc?.print) {
      window.print();
      return;
    }
    onCloseRef.current = typeof options?.onClose === "function" ? options.onClose : null;
    setOpen(true);
  }, []);

  const closePreview = useCallback(() => {
    setOpen(false);
    window.ipc?.print?.cleanupPreview?.();
    const onClose = onCloseRef.current;
    onCloseRef.current = null;
    onClose?.();
  }, []);

  useEffect(() => {
    function handleKeyDown(event) {
      const key = event.key?.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === "p") {
        // Always swallowed so Chromium never prints the whole app window, but the
        // preview only opens on a screen that has something to print.
        event.preventDefault();
        event.stopPropagation();
        if (!openRef.current && hasPrintableContent()) requestPrint();
      }
    }
    // Capture phase so this wins regardless of which input/element has
    // focus, and so it fires before any default browser print handling.
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [requestPrint]);

  return (
    <PrintPreviewContext.Provider value={{ requestPrint }}>
      {children}
      {open && <PrintPreviewModal onClose={closePreview} />}
    </PrintPreviewContext.Provider>
  );
}

export function usePrintPreview() {
  const ctx = useContext(PrintPreviewContext);
  if (!ctx) throw new Error("usePrintPreview must be used within PrintPreviewProvider");
  return ctx;
}
