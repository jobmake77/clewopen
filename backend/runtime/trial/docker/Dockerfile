ARG BASE_IMAGE=node:22-bookworm-slim
FROM ${BASE_IMAGE}

ARG OPENCLEW_INSTALL_COMMAND=""
ARG SKIP_OS_BOOTSTRAP=0

RUN if [ "${SKIP_OS_BOOTSTRAP}" != "1" ]; then \
      apt-get update \
      && apt-get install -y --no-install-recommends \
        bash \
        ca-certificates \
        curl \
        git \
        jq \
        unzip \
      && rm -rf /var/lib/apt/lists/*; \
    fi

RUN mkdir -p /opt/openclew/bin /opt/openclew/template /workspace/agent /workspace/state /workspace/logs /workspace/artifacts

RUN if [ -n "${OPENCLEW_INSTALL_COMMAND}" ]; then bash -lc "${OPENCLEW_INSTALL_COMMAND}"; fi \
  && if command -v openclew >/dev/null 2>&1; then ln -sf "$(command -v openclew)" /usr/local/bin/openclew-cli; \
     elif command -v openclaw >/dev/null 2>&1; then ln -sf "$(command -v openclaw)" /usr/local/bin/openclew-cli; \
     elif command -v clewopen >/dev/null 2>&1; then ln -sf "$(command -v clewopen)" /usr/local/bin/openclew-cli; \
     else printf '%s\n' '#!/bin/sh' 'echo "OpenCLEW CLI is not installed in this image" >&2' 'exit 127' > /usr/local/bin/openclew-cli \
       && chmod +x /usr/local/bin/openclew-cli; \
     fi

COPY session-runner.sh /opt/openclew/bin/session-runner.sh
COPY template/workspace /opt/openclew/template/workspace

RUN chmod +x /opt/openclew/bin/session-runner.sh \
  && mkdir -p /opt/openclew/template/home/.openclaw

ARG TRIAL_RUNTIME_TEMPLATE_HASH=dev

LABEL openclew.trial.runtime-hash="${TRIAL_RUNTIME_TEMPLATE_HASH}"
ENV PATH="/opt/openclew/bin:${PATH}"
ENV OPENCLEW_TRIAL_RUNTIME_HASH="${TRIAL_RUNTIME_TEMPLATE_HASH}"
WORKDIR /workspace

CMD ["sleep", "infinity"]
