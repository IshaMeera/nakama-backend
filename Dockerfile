FROM heroiclabs/nakama:3.22.0

COPY local.yml /nakama/data/local.yml
COPY data/modules /nakama/data/modules

EXPOSE 7350

ENTRYPOINT ["sh", "-c", "echo DB=$NAKAMA_DATABASE_ADDRESS && nakama migrate up --database.address \"$NAKAMA_DATABASE_ADDRESS\" && exec nakama --database.address \"$NAKAMA_DATABASE_ADDRESS\" --config /nakama/data/local.yml"]