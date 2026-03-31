FROM heroiclabs/nakama:3.22.0

COPY local.yml /nakama/data/local.yml
COPY data/modules /nakama/data/modules

EXPOSE 7350

CMD ["nakama", "--config", "/nakama/data/local.yml"]