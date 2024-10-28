@echo off

if exist .\lib\proto\gen rmdir /s /q .\lib\proto\gen
mkdir .\lib\proto\gen
protoc ^
    --plugin=protoc-gen-ts_proto=".\node_modules\.bin\protoc-gen-ts_proto.cmd" ^
    --ts_proto_opt=esModuleInterop=true ^
    --ts_proto_opt=outputJsonMethods=true ^
    --ts_proto_opt=outputEncodeMethods=false ^
    --ts_proto_opt=useJsonWireFormat=true ^
    --ts_proto_opt=useNumericEnumForJson=false ^
    --ts_proto_opt=removeEnumPrefix=true ^
    --ts_proto_opt=outputIndex=true ^
    --ts_proto_out=./lib/proto/gen ^
    ./proto/browser-media.proto ^
    -I=./proto
