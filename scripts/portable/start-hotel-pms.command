#!/bin/bash
# 宿泊管理（ポータブル版）の起動。このファイルをダブルクリックすると起動し、ターミナルを閉じると終了する
cd "$(dirname "$0")" || exit 1

# 初回だけ、空のデータベース（客室マスタ入り）を data フォルダに用意する
mkdir -p data
[ -f data/hotel.db ] || cp template.db data/hotel.db

export DATABASE_URL="file:$(pwd)/data/hotel.db"
export PORT="${PORT:-3000}" HOSTNAME=127.0.0.1 NODE_ENV=production NEXT_TELEMETRY_DISABLED=1

echo ""
echo "  宿泊管理を起動しています。"
echo "  このウィンドウを閉じると終了します。"
echo "  ブラウザが開かないときは http://localhost:$PORT を開いてください。"
echo ""
if [ -z "$HOTEL_PMS_NO_BROWSER" ]; then (sleep 3; open "http://localhost:$PORT") & fi
exec ./runtime/bin/node app/server.js
