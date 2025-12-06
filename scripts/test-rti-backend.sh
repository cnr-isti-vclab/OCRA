#!/bin/bash
RTI_ZIP=/home/lfabio/git/OCRA/coin_hsh.zip

#From DevTools/Application/Cookies session_id
SESSION_ID="cmitzff4m0007uejv0hvo8c9b"

#From curl -H "Cookie: session_id=${SESSION_ID}" http://localhost:3002/api/projects
PROJECT_ID="cmitzfh1c0008uejvaw91fwk5"

curl -v -X POST   -H "Cookie: session_id=${SESSION_ID}"   -F "file=@${RTI_ZIP}"   "http://localhost:3002/api/projects/${PROJECT_ID}/hdt/assets/rti/upload"

curl http://localhost:3002/rti-assets/${PROJECT_ID}/coin_hsh/info.json
