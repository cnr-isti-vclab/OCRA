#!/bin/bash

# 3DHOP Download Script
# must be run from the root of the frontend directory just like npm install
# Downloads 3DHOP 4.3 to a local cache directory

TARGET_DIR="3DHOP_4.3"
mkdir -p public/external
cd public/external

if [ -d "$TARGET_DIR" ]; then
    echo "3DHOP 4.3 already exists in cache, skipping download"
    exit 0
fi

echo "Downloading 3DHOP 4.3 to public/external/"

# Download and extract
curl -L -o 3dhop_4.3.zip "https://api.github.com/repos/cnr-isti-vclab/3DHOP/zipball/4.3"
unzip 3dhop_4.3.zip
mv cnr-isti-vclab-3DHOP-* $TARGET_DIR
rm 3dhop_4.3.zip

echo "3DHOP 4.3 downloaded to $TARGET_DIR"