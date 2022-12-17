// Setup editors
function setupInfoArea(id) {
  const e = ace.edit(id);
  e.setShowPrintMargin(false);
  e.setOptions({
    readOnly: true,
    highlightActiveLine: false,
    highlightGutterLine: false
  })
  e.renderer.$cursorLayer.element.style.opacity=0;
  return e;
}

function setupEditorArea(id, lsKey) {
  const e = ace.edit(id);
  e.setShowPrintMargin(false);
  e.setValue(localStorage.getItem(lsKey) || '');
  e.moveCursorTo(0, 0);
  return e;
}

const grammar = setupEditorArea("grammar-editor", "grammarText");
grammar.getSession().setMode("ace/mode/pgsql");
const code = setupEditorArea("code-editor", "codeText");
code.getSession().setMode("ace/mode/lua");

$('#genLua').prop('checked', true);

function loadCgCqlLua_sample(self) {
  let base_url = "https://raw.githubusercontent.com/mingodad/CG-SQL-Lua-playground/main/"
  switch(self.options[self.selectedIndex].value) {
    case "demo":
      $.get(base_url + "demo.sql", function( data ) {
        grammar.setValue( data );
      });
      break;
      case "upgrade_harness(with errors)":
      $.get(base_url + "upgrade_harness.cql", function( data ) {
        grammar.setValue( data );
      });
      break;
  }
}

// RunCgSql
function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function nl2br(str) {
  return str.replace(/\n/g, '<br>\n')
}

function textToErrors(str) {
  let errors = [];
  var regExp = /([^\n]+?)\n/g, match;
  while (match = regExp.exec(str)) {
    let msg = match[1];
    let line_col = msg.match(/^code.cql:(\d+):(\d+)/);
    if (line_col) {
      errors.push({"ln": line_col[1], "col":line_col[2], "msg": msg});
    } else {
      errors.push({"msg": msg});
    }
  }
  return errors;
}

function generateErrorListHTML(errors) {
  let html = '<ul>';

  html += $.map(errors, function (x) {
    if (x.ln > 0) {
      return '<li data-ln="' + x.ln + '" data-col="' + x.col +
        '"><span>' + escapeHtml(x.msg) + '</span></li>';
    } else {
      return '<li><span>' + escapeHtml(x.msg) + '</span></li>';
    }
  }).join('');

  html += '<ul>';

  return html;
}

function updateLocalStorage() {
  localStorage.setItem('grammarText', grammar.getValue());
  localStorage.setItem('codeText', code.getValue());
  localStorage.setItem('optimizationMode', $('#opt-mode').val());
  localStorage.setItem('packrat', $('#packrat').prop('checked'));
  localStorage.setItem('autoRefresh', $('#auto-refresh').prop('checked'));
}

// convert a Javascript string to a C string
function jstr2C(s) {
  var size = lengthBytesUTF8(s) + 1;
  var ret = _malloc(size);
  if (ret) stringToUTF8Array(s, HEAP8, ret, size);
  return ret;
}

function run_argc_argv(jfunc, jstrings) {
  let c_strings = jstrings.map(x => jstr2C(x));

  // allocate and populate the array. adapted from https://stackoverflow.com/a/23917034
  let argc = c_strings.length;
  let c_arr = _malloc((argc+1)*4); // 4-bytes per pointer
  c_strings.forEach(function(x, i) {
    Module.setValue(c_arr + i * 4, x, "i32");
  });
  c_arr[argc] = 0;

  // invoke our C function
  let rc = jfunc(argc, c_arr);

  // free c_strings
  for(let i = 0; i < argc; i++)
    _free(c_strings[i]);

  // free c_arr
  _free(c_arr);

  // return
  return rc;
}

function callCustomMain(mfunc, args) {
	Module["_main"] = Module[mfunc];
	return callMain(args);
}

function RunCgSql() {
  const $grammarValidation = $('#grammar-validation');
  const $grammarInfo = $('#grammar-info');
  const grammarText = grammar.getValue();

  const $codeValidation = $('#code-validation');
  const $codeInfo = $('#code-info');
  const codeText = code.getValue();

  const optimizationMode = $('#opt-mode').val();
  const genLua = $('#genLua').prop('checked');
  const genC = $('#genC').prop('checked');
  const genJsonSchema = $('#genJsonSchema').prop('checked');
  const genSchemaUpgrade = $('#genSchemaUpgrade').prop('checked');

  $grammarInfo.html('');
  $grammarValidation.hide();
  $codeInfo.html('');
  $codeValidation.hide();

  outputs.compile_status = '';
  outputs.parse_status = '';
  outputs.default = '';

  if (grammarText.length === 0) {
    return;
  }

  $('#overlay').css({
    'z-index': '1',
    'display': 'block',
    'background-color': 'rgba(0, 0, 0, 0.1)'
  });

  window.setTimeout(() => {
    const code_cql_fname = "code.cql";
    const code_lua_fname = "code.lua";
    const code_c_fname = "code.c";
    const code_h_fname = "code.h";
    const code_json_fname = "code.json";
    const code_schema_fname = "code.sql";
    if(FS.findObject(code_cql_fname))
      FS.unlink(code_cql_fname);
    FS.createDataFile("/", code_cql_fname, grammar.getValue(), true, true, true);
    output = "parse_status";
    let rc;
    if(genJsonSchema) {
      if(FS.findObject(code_json_fname))
        FS.unlink(code_json_fname);
      rc = run_argc_argv(_cql_main, ["cql", "--in", code_cql_fname, "--rt", "json_schema", "--cg", code_json_fname]);
    }
    else if(genSchemaUpgrade) {
      if(FS.findObject(code_schema_fname))
        FS.unlink(code_schema_fname);
      rc = run_argc_argv(_cql_main, ["cql", "--in", code_cql_fname, "--rt", "schema_upgrade", "--cg", code_schema_fname, "--global_proc",  "gen_db"]);
    }
    else if(genLua) {
      if(FS.findObject(code_lua_fname))
        FS.unlink(code_lua_fname);
      rc = run_argc_argv(_cql_main, ["cql", "--in", code_cql_fname, "--rt", "lua", "--cg", code_lua_fname]);
    }
    else if(genC) {
      if(FS.findObject(code_c_fname))
        FS.unlink(code_c_fname);
      if(FS.findObject(code_h_fname))
        FS.unlink(code_h_fname);
      rc = run_argc_argv(_cql_main, ["cql", "--in", code_cql_fname, "--cg", code_h_fname, code_c_fname]);
    }
    else throw("Unknown code generator");
    output = "default";
    if( rc == 0 ) {
      $grammarValidation.removeClass('validation-invalid').show();
      //$grammarInfo.html('<pre>' + FS.readdir("/") + '</pre>');
       if(genJsonSchema) {
	 code.getSession().setMode("ace/mode/json");
	 code.setValue(FS.readFile(code_json_fname, { encoding: 'utf8' }));
      }
      else if(genSchemaUpgrade) {
	 code.getSession().setMode("ace/mode/pgsql");
	 code.setValue(FS.readFile(code_schema_fname, { encoding: 'utf8' }));
      }
      else if(genLua) {
	 code.getSession().setMode("ace/mode/lua");
	 code.setValue(FS.readFile(code_lua_fname, { encoding: 'utf8' }));
	 run_argc_argv(_lua_main, ["lua", code_lua_fname]);
         $codeInfo.html('<pre>' + outputs.default + '</pre>');
      }
      else if(genC) {
	 code.getSession().setMode("ace/mode/c_cpp");
	 code.setValue(
	      "/* ==Start of code.h */\n"
	      + FS.readFile(code_h_fname, { encoding: 'utf8' })
	      + "\n/* ==End of code.h */\n\n/* ==Start of code.c */\n"
	      + FS.readFile(code_c_fname, { encoding: 'utf8' })
	      + "\n/* ==End of code.c */\n"
	      );
      }
      else throw("Unknown generated code");
    }
    else {
      $grammarValidation.addClass('validation-invalid').show();
      //$grammarInfo.html('<pre>' + outputs.parse_status + '</pre>');
      const errors = textToErrors(outputs.parse_status);
      const html = generateErrorListHTML(errors);
      $grammarInfo.html(html);
    }

    $('#overlay').css({
      'z-index': '-1',
      'display': 'none',
      'background-color': 'rgba(1, 1, 1, 1.0)'
    });

  }, 0);
}

// Event handing for text editing
let timer;
function setupTimer() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    updateLocalStorage();
    if ($('#auto-refresh').prop('checked')) {
      RunCgSql();
    }
  }, 200);
};
grammar.getSession().on('change', setupTimer);
code.getSession().on('change', setupTimer);

// Event handing in the info area
function makeOnClickInInfo(editor) {
  return function () {
    const el = $(this);
    let line = el.data('ln') - 1;
    let col = el.data('col') - 1;
    editor.navigateTo(line, col);
    editor.scrollToLine(line, true, false, null);
    editor.focus();
  }
};
$('#grammar-info').on('click', 'li[data-ln]', makeOnClickInInfo(grammar));
$('#code-info').on('click', 'li[data-ln]', makeOnClickInInfo(code));

// Event handing in the AST optimization
$('#runCgSql').on('click', RunCgSql);

// Resize editors to fit their parents
function resizeEditorsToParent() {
  code.resize();
  code.renderer.updateFull();
}

// Show windows
function setupToolWindow(lsKeyName, buttonSel, codeSel, showDefault) {
  let storedValue = localStorage.getItem(lsKeyName);
  if (!storedValue) {
    localStorage.setItem(lsKeyName, showDefault);
    storedValue = localStorage.getItem(lsKeyName);
  }
  let show = storedValue === 'true';
  $(buttonSel).prop('checked', show);
  $(codeSel).css({ 'display': show ? 'block' : 'none' });

  $(buttonSel).on('change', () => {
    show = !show;
    localStorage.setItem(lsKeyName, show);
    $(codeSel).css({ 'display': show ? 'block' : 'none' });
    resizeEditorsToParent();
  });
}

// Show page
$('#main').css({
  'display': 'flex',
});

// used to collect output from C
var outputs = {
  'default': '',
  'compile_status': '',
  'parse_status': '',
};

// current output (key in `outputs`)
var output = "default";

// results of the various stages
var result = {
  'compile': 0,
  'parse': 0,
};

// chpeg_parse function: initialized when emscripten runtime loads
var cql_main = null;
var lua_main = null;
var luac_main = null;
var ucpp_main = null;

// Emscripten
var Module = {

  // intercept stdout (print) and stderr (printErr)
  // note: text received is line based and missing final '\n'

  'print': function(text) {
    outputs[output] += text + "\n";
  },
  'printErr': function(text) {
    outputs[output] += text + "\n";
  },

  // called when emscripten runtime is initialized
  'onRuntimeInitialized': function() {
    // wrap the C `parse` function
    cql_main = cwrap('cql_main', ['number', 'array']);
    lua_main = cwrap('lua_main', ['number', 'array']);
    luac_main = cwrap('luac_main', ['number', 'array']);
    ucpp_main = cwrap('ucpp_main', ['number', 'array']);
    // Initial parse
    if ($('#auto-refresh').prop('checked')) {
      RunCgSql();
    }
  },
};

// vim: sw=2:sts=2
