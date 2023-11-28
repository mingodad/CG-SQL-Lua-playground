#!/bin/sh
destFolder=./
srcFolder=$PWD
sqlite3h="/home/mingo/dev/dadbiz++/third-party/dad/sqlite3-orig"
cqlh="/home/mingo/dev/dadbiz++/third-party/dad/CG-SQL0/sources"

#there is a bug in cql when compiling with -Os
emsdk-env emcc  \
	-Oz -DMAKE_LUA_WASM -DLUA_PROGNAME='"lua"' \
	-DLUA_COMPAT_5_3 -DLUA_USE_LINUX -D_XOPEN_SOURCE=500 \
	-DWITH_LPEGLABEL  -DMAKE_LUA_CMD -DMAKE_LUAC_CMD \
	-DWITH_UCPP -DUCPP_CONFIG -DSTAND_ALONE  -DNO_UCPP_BUF \
	-o cql-lua-playground.js am-lua-5.4.6.c \
	-DWITH_LSQLITE3 -DSQLITE_THREADSAFE=0 \
	-DSQLITE_ENABLE_MATH_FUNCTIONS -DSQLITE_ENABLE_COLUMN_METADATA=1 \
	-I$sqlite3h $sqlite3h/sqlite3.c \
	-DCQL_AMALGAM -DCQL_IS_NOT_MAIN $cqlh/out/cql_amalgam.c \
	-s EXPORTED_FUNCTIONS=_main,_run_cgsql_lua,_cql_main,_lua_main,_luac_main,_ucpp_main,_free,_malloc \
	-s EXPORTED_RUNTIME_METHODS=ccall,cwrap,FS,callMain,setValue \
	-s ALLOW_MEMORY_GROWTH=1 -s INVOKE_RUN=0 -s EXIT_RUNTIME=0 \
	-s STACK_SIZE=8MB \
	--embed-file $HOME/dev/lua/lpeglabel/relabel.lua@$destFolder \
	--embed-file $HOME/dev/lua/lpegrex/lpegrex.lua@$destFolder \
	--embed-file $cqlh/cqlrt.lua@$destFolder

#-g -DWITHOUT_MEMPOOL -fsanitize=address
#	-g -s ASSERTIONS=1 -s SAFE_HEAP=1 -s DETERMINISTIC=1 \
#-s ASSERTIONS -s STACK_OVERFLOW_CHECK=2 \
# -s STACK_SIZE=5MB needed by emscripten 3.1.27 and above because they reduced it to 64KB
