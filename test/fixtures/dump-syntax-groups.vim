" Dumps, for each source line, the set of RAW (untranslated, unfolded) syntax
" group names present on that line -- one output line per source line, as a
" comma-separated list of group names in first-seen order (deduplicated).
"
" Unlike dump-syntax.vim, this performs no folding of builtin markdown*
" groups into poemAnalysis: it exists solely to power a version-tolerant
" smoke check (see test/vim-syntax.test.js) that at least one markdown*
" group appears somewhere in the analysis section, confirming poem.vim's
" poemAnalysis region actually delegates to the embedded Markdown syntax via
" contains=@poemMarkdown. It deliberately does not assert exact group names
" or the character runs they cover, since those drift between Vim versions.
"
" Uses synID(..., 0) (untranslated), same as dump-syntax.vim.
"
" Assumes the buffer contains only single-byte characters (true of the
" checked-in fixture): synID()'s {col} is byte-based.
"
" Expects the buffer to already be loaded and syntax-highlighted (filetype
" set, `:syntax enable` run) by the caller. Reads $DUMP_OUT for the output
" path. See test/vim-syntax.test.js for the full invocation.

let s:dump = []
for s:lnum in range(1, line('$'))
  let s:text = getline(s:lnum)
  let s:len = strlen(s:text)
  let s:groups = []
  let s:col = 1
  while s:col <= s:len
    let s:name = synIDattr(synID(s:lnum, s:col, 0), 'name')
    if !empty(s:name) && index(s:groups, s:name) == -1
      call add(s:groups, s:name)
    endif
    let s:col += 1
  endwhile
  call add(s:dump, join(s:groups, ','))
endfor

call writefile(s:dump, expand('$DUMP_OUT'))
