FROM e2bdev/base:latest
RUN apt-get update && apt-get install -y --no-install-recommends nodejs npm && rm -rf /var/lib/apt/lists/* \
  && npm install --global tsx@4.19.2 typescript@5.7.3 && npm cache clean --force
