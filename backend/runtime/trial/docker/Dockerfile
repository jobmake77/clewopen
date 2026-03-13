ARG BASE_IMAGE=node:22-bookworm-slim
FROM ${BASE_IMAGE}

ARG OPENCLEW_INSTALL_COMMAND=""

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    curl \
    git \
    jq \
    unzip \
  && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /opt/openclew/bin /workspace/agent /workspace/state /workspace/logs /workspace/artifacts

COPY session-runner.sh /opt/openclew/bin/session-runner.sh

RUN chmod +x /opt/openclew/bin/session-runner.sh \
  && if [ -n "${OPENCLEW_INSTALL_COMMAND}" ]; then bash -lc "${OPENCLEW_INSTALL_COMMAND}"; fi \
  && if command -v openclew >/dev/null 2>&1; then ln -sf "$(command -v openclew)" /usr/local/bin/openclew-cli; \
     elif command -v openclaw >/dev/null 2>&1; then ln -sf "$(command -v openclaw)" /usr/local/bin/openclew-cli; \
     elif command -v clewopen >/dev/null 2>&1; then ln -sf "$(command -v clewopen)" /usr/local/bin/openclew-cli; \
     else printf '%s\n' '#!/bin/sh' 'echo "OpenCLEW CLI is not installed in this image" >&2' 'exit 127' > /usr/local/bin/openclew-cli \
       && chmod +x /usr/local/bin/openclew-cli; \
     fi

ENV PATH="/opt/openclew/bin:${PATH}"
WORKDIR /workspace

CMD ["sleep", "infinity"]
