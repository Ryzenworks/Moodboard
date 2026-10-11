import {
  useRef, useState, useCallback, useEffect,
  forwardRef, useImperativeHandle,
} from 'react';
import type { ComposerReference, PromptNode } from '@shared/types';
import { MAX_PROMPT_LENGTH } from '@shared/types';
import { RefSuggestionPopup } from './RefSuggestionPopup';

// ── Public handle ──

export interface RichPromptEditorHandle {
  /** Insert a reference chip at the current cursor position */
  insertRef: (ref: ComposerReference) => void;
  /** Replace all content (for RECREATE) */
  setContent: (nodes: PromptNode[], refs: ComposerReference[]) => void;
  /** Read the structured content from the DOM */
  getContent: () => PromptNode[];
  /** Get plain-text version (for storage / display) */
  getPlainText: () => string;
  /** Focus the editor */
  focus: () => void;
}

interface Props {
  references: ComposerReference[];
  onContentChange: (nodes: PromptNode[], textLength: number) => void;
  onSubmit: () => void;
}

// ── Helpers ──

/** Walk the contentEditable DOM and produce a PromptNode[] model */
function parseDom(root: HTMLElement): PromptNode[] {
  const nodes: PromptNode[] = [];

  const walk = (parent: Node) => {
    for (const child of Array.from(parent.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const t = child.textContent ?? '';
        if (t) nodes.push({ type: 'text', text: t });
      } else if (child instanceof HTMLElement) {
        if (child.dataset.refId) {
          nodes.push({ type: 'ref', refId: child.dataset.refId });
        } else if (child.tagName === 'BR') {
          nodes.push({ type: 'text', text: '\n' });
        } else {
          // contentEditable may wrap lines in <div>s — recurse
          walk(child);
          // add newline after block elements except the last one
          if (child.tagName === 'DIV' && child.nextSibling) {
            nodes.push({ type: 'text', text: '\n' });
          }
        }
      }
    }
  };

  walk(root);
  return nodes;
}

/** Compute a plain-text preview from nodes */
function plainText(nodes: PromptNode[], refs: ComposerReference[]): string {
  return nodes.map(n => {
    if (n.type === 'text') return n.text;
    const ref = refs.find(r => r.id === n.refId);
    return ref ? `@img${ref.sortOrder + 1}` : '@img?';
  }).join('');
}

/** Count logical characters (text length + placeholder tokens) */
function charCount(nodes: PromptNode[]): number {
  return nodes.reduce((sum, n) => {
    return sum + (n.type === 'text' ? n.text.length : 6);
  }, 0);
}

// ── Component ──

export const RichPromptEditor = forwardRef<RichPromptEditorHandle, Props>(
  function RichPromptEditor({ references, onContentChange, onSubmit }, handle) {
    const editorRef = useRef<HTMLDivElement>(null);

    // @ suggestion popup
    const [showSuggestion, setShowSuggestion] = useState(false);
    const [suggestionPos, setSuggestionPos] = useState({ top: 0, left: 0 });
    const atRangeRef = useRef<Range | null>(null); // range ending after '@'

    // click-on-chip popup
    const [chipPicker, setChipPicker] = useState<{
      chipEl: HTMLElement;
      pos: { top: number; left: number };
    } | null>(null);

    const [textLen, setTextLen] = useState(0);

    // ── Parse & notify parent ──
    const syncModel = useCallback(() => {
      const el = editorRef.current;
      if (!el) return;
      const nodes = parseDom(el);
      const len = charCount(nodes);
      setTextLen(len);
      onContentChange(nodes, len);
    }, [onContentChange]);

    // ── Build a chip DOM element ──
    const buildChip = useCallback((ref: ComposerReference): HTMLSpanElement => {
      const chip = document.createElement('span');
      chip.className = 'ref-chip-inline';
      chip.contentEditable = 'false';
      chip.dataset.refId = ref.id;
      chip.setAttribute('draggable', 'true');

      const thumb = document.createElement('img');
      thumb.src = ref.previewUrl;
      thumb.alt = '';
      thumb.className = 'rci-thumb';

      const label = document.createElement('span');
      label.className = 'rci-label';
      label.textContent = `IMG ${ref.sortOrder + 1}`;

      const x = document.createElement('span');
      x.className = 'rci-x';
      x.textContent = '×';
      x.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        chip.remove();
        syncModel();
      });

      chip.appendChild(thumb);
      chip.appendChild(label);
      chip.appendChild(x);

      // Click to change which image this chip refers to
      chip.addEventListener('mousedown', (e) => {
        // Only open picker on left-click on the chip body (not the × button)
        if ((e.target as HTMLElement).classList.contains('rci-x')) return;
        e.preventDefault();
        e.stopPropagation();
        const rect = chip.getBoundingClientRect();
        const editorRect = editorRef.current?.getBoundingClientRect();
        if (editorRect) {
          setChipPicker({
            chipEl: chip,
            pos: {
              top: rect.bottom - editorRect.top + 4,
              left: rect.left - editorRect.left,
            },
          });
        }
      });

      return chip;
    }, [syncModel]);

    // ── Insert a reference chip at the current cursor ──
    const insertRef = useCallback((ref: ComposerReference) => {
      const el = editorRef.current;
      if (!el) return;
      el.focus();

      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) {
        el.appendChild(buildChip(ref));
        el.appendChild(document.createTextNode('\u00A0')); // trailing space
      } else {
        const range = sel.getRangeAt(0);
        if (!range.collapsed) range.deleteContents();
        const chip = buildChip(ref);
        range.insertNode(chip);
        // Insert a zero-width space after the chip so cursor can sit there
        const spacer = document.createTextNode('\u00A0');
        chip.after(spacer);
        range.setStartAfter(spacer);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      }
      syncModel();
    }, [buildChip, syncModel]);

    // ── @ suggestion select ──
    const handleSuggestionSelect = useCallback((ref: ComposerReference) => {
      setShowSuggestion(false);
      const el = editorRef.current;
      if (!el || !atRangeRef.current) return;

      // Delete everything from the '@' to the current cursor
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const currentRange = sel.getRangeAt(0);
        const deleteRange = document.createRange();
        deleteRange.setStart(atRangeRef.current.startContainer, atRangeRef.current.startOffset);
        deleteRange.setEnd(currentRange.endContainer, currentRange.endOffset);
        deleteRange.deleteContents();

        // Now insert the chip at that position
        const chip = buildChip(ref);
        deleteRange.insertNode(chip);
        const spacer = document.createTextNode('\u00A0');
        chip.after(spacer);
        const r = document.createRange();
        r.setStartAfter(spacer);
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
      }

      atRangeRef.current = null;
      syncModel();
      el.focus();
    }, [buildChip, syncModel]);

    // ── Chip change-reference ──
    const handleChipChange = useCallback((ref: ComposerReference) => {
      if (!chipPicker) return;
      const { chipEl } = chipPicker;
      chipEl.dataset.refId = ref.id;
      const thumb = chipEl.querySelector('.rci-thumb') as HTMLImageElement | null;
      if (thumb) thumb.src = ref.previewUrl;
      const label = chipEl.querySelector('.rci-label');
      if (label) label.textContent = `IMG ${ref.sortOrder + 1}`;
      setChipPicker(null);
      syncModel();
    }, [chipPicker, syncModel]);

    // ── Input handler: detect '@' ──
    const handleInput = useCallback(() => {
      syncModel();

      // Check for @ trigger
      if (references.length === 0) return;
      const sel = window.getSelection();
      if (!sel || !sel.focusNode || sel.focusNode.nodeType !== Node.TEXT_NODE) return;

      const text = sel.focusNode.textContent ?? '';
      const offset = sel.focusOffset;

      // Look for '@' right before cursor (possibly with trailing filter chars)
      const before = text.slice(0, offset);
      const atIdx = before.lastIndexOf('@');
      if (atIdx === -1) return;

      // Only trigger if the @ is at the end or has only alphanumeric after it
      const afterAt = before.slice(atIdx + 1);
      if (afterAt && !/^[a-zA-Z0-9]*$/.test(afterAt)) return;

      // Compute popup position from cursor
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const editorRect = editorRef.current?.getBoundingClientRect();
      if (!editorRect || rect.top === 0) return;

      // Save range pointing to the '@' character
      const atRange = document.createRange();
      atRange.setStart(sel.focusNode, atIdx);
      atRange.setEnd(sel.focusNode, atIdx);
      atRangeRef.current = atRange;

      setSuggestionPos({
        top: rect.bottom - editorRect.top + 4,
        left: rect.left - editorRect.left,
      });
      setShowSuggestion(true);
    }, [references, syncModel]);

    // ── Key handling ──
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        onSubmit();
        return;
      }
      if (showSuggestion && e.key === 'Escape') {
        e.preventDefault();
        setShowSuggestion(false);
      }
    }, [showSuggestion, onSubmit]);

    // ── Paste: strip HTML ──
    const handlePaste = useCallback((e: React.ClipboardEvent) => {
      e.preventDefault();
      const text = e.clipboardData.getData('text/plain');
      document.execCommand('insertText', false, text);
    }, []);

    // ── Drop: accept reference tiles ──
    const handleDrop = useCallback((e: React.DragEvent) => {
      const refId = e.dataTransfer.getData('text/ref-id');
      if (!refId) return;
      e.preventDefault();
      const ref = references.find(r => r.id === refId);
      if (!ref) return;

      // Place cursor at drop point
      const range = document.caretRangeFromPoint?.(e.clientX, e.clientY);
      if (range) {
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
      insertRef(ref);
    }, [references, insertRef]);

    const handleDragOver = useCallback((e: React.DragEvent) => {
      if (e.dataTransfer.types.includes('text/ref-id')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }
    }, []);

    // ── setContent: populate editor from PromptNode[] (RECREATE) ──
    const setContent = useCallback((nodes: PromptNode[], refs: ComposerReference[]) => {
      const el = editorRef.current;
      if (!el) return;
      el.innerHTML = '';
      for (const node of nodes) {
        if (node.type === 'text') {
          el.appendChild(document.createTextNode(node.text));
        } else if (node.type === 'ref') {
          const ref = refs.find(r => r.id === node.refId);
          if (ref) el.appendChild(buildChip(ref));
        }
      }
      syncModel();
    }, [buildChip, syncModel]);

    // ── Expose handle ──
    useImperativeHandle(handle, () => ({
      insertRef,
      setContent,
      getContent: () => editorRef.current ? parseDom(editorRef.current) : [],
      getPlainText: () => {
        const nodes = editorRef.current ? parseDom(editorRef.current) : [];
        return plainText(nodes, references);
      },
      focus: () => editorRef.current?.focus(),
    }), [insertRef, setContent, references]);

    // ── Close popups on outside click ──
    useEffect(() => {
      const handler = () => {
        setShowSuggestion(false);
        setChipPicker(null);
      };
      // We use 'click' (not mousedown) so our popup's preventDefault works
      document.addEventListener('click', handler);
      return () => document.removeEventListener('click', handler);
    }, []);

    return (
      <div className="rich-editor-wrap" onClick={(e) => e.stopPropagation()}>
        <div
          ref={editorRef}
          className="rich-editor"
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          data-placeholder="Describe your image—try @ to add references"
          spellCheck={false}
          role="textbox"
          aria-multiline="true"
        />

        <div className="rich-editor-bar">
          <span className="rich-editor-count">
            {textLen > 0
              ? `${textLen.toLocaleString()} / ${MAX_PROMPT_LENGTH.toLocaleString()}`
              : ''}
          </span>
        </div>

        {/* @ autocomplete popup */}
        {showSuggestion && references.length > 0 && (
          <RefSuggestionPopup
            references={references}
            position={suggestionPos}
            onSelect={handleSuggestionSelect}
            onClose={() => setShowSuggestion(false)}
          />
        )}

        {/* Click-to-change popup on existing chip */}
        {chipPicker && (
          <RefSuggestionPopup
            references={references}
            position={chipPicker.pos}
            onSelect={handleChipChange}
            onClose={() => setChipPicker(null)}
            activeRefId={chipPicker.chipEl.dataset.refId}
          />
        )}
      </div>
    );
  },
);
