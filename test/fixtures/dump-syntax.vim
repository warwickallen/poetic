" Dumps the syntax highlighting Vim assigns to the current buffer, one
" source line per output line, as space-separated "[text run]=group" pairs.
"
" Uses synID(..., 0) (untranslated) so the dump reflects poem.vim's own
" group names (e.g. "poemTitle") rather than whatever builtin group they
" happen to be `:hi link`ed to -- keeping the result independent of
" colorscheme, terminal capabilities, and TOhtml's output format, all of
" which vary across machines and Vim versions.
"
" Assumes the buffer contains only single-byte characters (true of the
" checked-in fixture): synID()'s {col} and strpart()'s offsets are both
" byte-based, so this loop would need byteidx() conversions to stay correct
" for multibyte text.
"
" Expects the buffer to already be loaded and syntax-highlighted (filetype
" set, `:syntax enable` run) by the caller. Reads $DUMP_OUT for the output
" path. See test/vim-syntax.test.js for the full invocation.

function! s:GroupAt(lnum, col) abort
  let l:name = synIDattr(synID(a:lnum, a:col, 0), 'name')
  return empty(l:name) ? '-' : l:name
endfunction

let s:dump = []
for s:lnum in range(1, line('$'))
  let s:text = getline(s:lnum)
  let s:len = strlen(s:text)
  let s:runs = []
  if s:len > 0
    let s:runStart = 1
    let s:runGroup = s:GroupAt(s:lnum, 1)
    let s:col = 2
    while s:col <= s:len
      let s:group = s:GroupAt(s:lnum, s:col)
      if s:group !=# s:runGroup
        call add(s:runs, '[' . strpart(s:text, s:runStart - 1, s:col - s:runStart) . ']=' . s:runGroup)
        let s:runStart = s:col
        let s:runGroup = s:group
      endif
      let s:col += 1
    endwhile
    call add(s:runs, '[' . strpart(s:text, s:runStart - 1, s:len - s:runStart + 1) . ']=' . s:runGroup)
  endif
  call add(s:dump, join(s:runs, ' '))
endfor

call writefile(s:dump, expand('$DUMP_OUT'))
