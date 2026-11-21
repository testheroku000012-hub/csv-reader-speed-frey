// solve.js — a faster drop-in for make.fun's csv-reader 1.0.0.
//
// It returns exactly csv-reader 1.0.0's answer for every input {text, header}:
// {columns, rows, errors}. The reading policy is csv-reader's own (see the
// competition's rules): a U+FEFF at the very start is dropped; a record ends at
// LF or CRLF and a line left with no characters is no record; outside quotes a
// CR not followed by LF is dropped (stray_cr); a field that opens with a quote
// runs to the next quote that is not doubled ("" inside it is one quote, each
// CRLF or lone CR inside it is read as LF); what follows its closing quote, up
// to the next comma or line break, is appended as it stands (quote_junk, when
// the field ends); a quote that never closes is a literal character and the
// text after it is read again as unquoted (unterminated_quote); a quote inside
// an unquoted field is a literal character; fields stay strings; columns is
// the first record when header is true, else null; rows are padded with ""
// (short_row) or cut (long_row) to the first record's width; each error is
// {code, line, row}, in the order met.
//
// Speed comes from how the text is scanned, never from a different reading.
// Records are read a line at a time: a line with no quote and no CR is split
// on commas; a line with quotes but no CR is read by a small line parser that
// jumps from quote to quote and comma to comma instead of reading one
// character at a time. Only a record whose quoted field runs past its line,
// or whose line holds a stray CR, is read by the character-level reader,
// which follows csv-reader's loop step for step.
//
// Pure: no clock, no randomness, no locale, nothing kept from one call to
// the next. Dependency-free, ES module, Node 22.

/** How a field ended: 0 at a comma, 1 at a line break, 2 at the end of the text. */
const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** The next terminator of an unquoted field: a comma, a CR or an LF. */
const TERM = /[,\r\n]/g;

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const len = text.length;
  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows it takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  function error(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Reads unquoted characters onto `value` up to the next comma or line break: a CR not followed by LF is dropped
  // (stray_cr). Returns the field and how it ended; `added` counts the characters kept. Only used where a line
  // holds a stray CR, so it runs rarely.
  function readUnquoted(value) {
    let added = 0;
    for (;;) {
      TERM.lastIndex = pos;
      const m = TERM.exec(text);
      if (m === null) {
        if (pos < len) {
          value += text.slice(pos);
          added += len - pos;
          pos = len;
        }
        return { value, ended: END, added };
      }
      const i = m.index;
      if (i > pos) {
        value += text.slice(pos, i);
        added += i - pos;
      }
      const c = text.charCodeAt(i);
      if (c === 44) {
        pos = i + 1;
        return { value, ended: COMMA, added };
      }
      if (c === 10) {
        pos = i + 1;
        line += 1;
        return { value, ended: LINE_BREAK, added };
      }
      if (text.charCodeAt(i + 1) === 10) {
        pos = i + 2;
        line += 1;
        return { value, ended: LINE_BREAK, added };
      }
      error('stray_cr');
      pos = i + 1;
    }
  }

  // Reads a quoted field whose opening quote is at pos. Only used where a quoted field runs past its line, or a
  // quote never closes, so it runs rarely.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let value = '';
    pos += 1;
    let closed = false;
    while (pos < len) {
      const q = text.indexOf('"', pos);
      if (q === -1) break;
      if (q > pos) {
        const seg = text.slice(pos, q);
        if (seg.indexOf('\r') === -1 && seg.indexOf('\n') === -1) {
          value += seg;
        } else {
          // CRLF and a lone CR inside quotes are each one LF.
          for (let i = 0; i < seg.length; i++) {
            const ch = seg.charCodeAt(i);
            if (ch === 13) {
              value += '\n';
              line += 1;
              if (seg.charCodeAt(i + 1) === 10) i += 1;
            } else {
              if (ch === 10) line += 1;
              value += seg[i];
            }
          }
        }
      }
      if (text.charCodeAt(q + 1) === 34) {
        value += '"';
        pos = q + 2;
        continue;
      }
      pos = q + 1;
      closed = true;
      break;
    }
    if (!closed) {
      // The quote never closes: it is a literal character, and the text after it is read again as unquoted.
      pos = open + 1;
      line = openLine;
      error('unterminated_quote');
      return readUnquoted('"');
    }
    if (pos >= len) return { value, ended: END };
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos += 1;
      return { value, ended: COMMA };
    }
    if (c === 10) {
      pos += 1;
      line += 1;
      return { value, ended: LINE_BREAK };
    }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      return { value, ended: LINE_BREAK };
    }
    // What follows the closing quote is appended as it stands, up to the next comma or line break.
    const junk = readUnquoted(value);
    if (junk.added > 0) error('quote_junk');
    return junk;
  }

  // Reads one record the character-level way, exactly csv-reader's reading. Used only where the line reader
  // cannot: a quoted field that runs past its line, or a line that holds a stray CR.
  function readRecordSlow() {
    const fields = [];
    let field;
    let quoted = false;
    do {
      quoted = text.charCodeAt(pos) === 34;
      field = quoted ? readQuoted() : readUnquoted('');
      fields.push(field.value);
    } while (field.ended === COMMA);
    finishRecord(fields, quoted);
  }

  // Reads one record that fits on one line, from the line's text (no CR in it, the line break already stripped).
  // Returns {fields, lastQuoted, junk} — junk counts the quote_junk errors the record holds — or null when a
  // quoted field does not close on this line, so the record must be read the slow way.
  function readLine(lineStr) {
    const L = lineStr.length;
    const fields = [];
    let junk = 0;
    let lastQuoted = false;
    let i = 0;
    for (;;) {
      let ended;
      let field;
      if (lineStr.charCodeAt(i) === 34) {
        lastQuoted = true;
        let j = i + 1;
        let val = '';
        for (;;) {
          const q = lineStr.indexOf('"', j);
          if (q === -1) return null;
          if (lineStr.charCodeAt(q + 1) === 34) {
            val += lineStr.slice(j, q) + '"';
            j = q + 2;
            continue;
          }
          val += lineStr.slice(j, q);
          j = q + 1;
          break;
        }
        if (j >= L) {
          field = val;
          ended = LINE_BREAK;
        } else if (lineStr.charCodeAt(j) === 44) {
          field = val;
          ended = COMMA;
          i = j + 1;
        } else {
          const k = lineStr.indexOf(',', j);
          const kend = k === -1 ? L : k;
          if (kend > j) {
            val += lineStr.slice(j, kend);
            junk += 1;
          }
          field = val;
          if (k === -1) ended = LINE_BREAK;
          else {
            ended = COMMA;
            i = k + 1;
          }
        }
      } else {
        lastQuoted = false;
        const k = lineStr.indexOf(',', i);
        if (k === -1) {
          field = lineStr.slice(i);
          ended = LINE_BREAK;
        } else {
          field = lineStr.slice(i, k);
          ended = COMMA;
          i = k + 1;
        }
      }
      fields.push(field);
      if (ended === LINE_BREAK) break;
    }
    return { fields, lastQuoted, junk };
  }

  // Ends one record: a line that held only stray CRs is left with no characters (no record); the header takes
  // columns; any other record is padded or cut to the first record's width.
  function finishRecord(fields, quoted) {
    if (fields.length === 1 && fields[0] === '' && !quoted) return;
    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      return;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    // This record starts on one line: read that line (its break stripped).
    const nl = text.indexOf('\n', pos);
    let end = nl === -1 ? len : nl;
    if (nl !== -1 && end > pos && text.charCodeAt(end - 1) === 13) end -= 1;
    const lineStr = text.slice(pos, end);
    const hasQuote = lineStr.indexOf('"') !== -1;
    const hasCR = lineStr.indexOf('\r') !== -1;
    if (!hasQuote && !hasCR) {
      // No quote and no CR: the record is the line split on commas.
      finishRecord(lineStr.split(','), false);
      pos = nl === -1 ? len : nl + 1;
      if (nl !== -1) line += 1;
      continue;
    }
    if (!hasCR) {
      // Quotes but no CR: the line reader, unless a quoted field runs past the line.
      const parsed = readLine(lineStr);
      if (parsed !== null) {
        for (let k = 0; k < parsed.junk; k++) error('quote_junk');
        finishRecord(parsed.fields, parsed.lastQuoted);
        pos = nl === -1 ? len : nl + 1;
        if (nl !== -1) line += 1;
        continue;
      }
    }
    readRecordSlow();
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
