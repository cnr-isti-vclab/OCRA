ARG BASE_IMAGE=pytorch/pytorch:2.5.1-cuda12.1-cudnn9-runtime

FROM ${BASE_IMAGE}

ENV PYTHONUNBUFFERED=1
ENV SAM2_BUILD_CUDA=0
ENV APP_ROOT=/opt/sam2
ENV MODEL_SIZE=tiny
ENV PORT=5001

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install SAM2 Python package from the repository
COPY sam2/setup.py sam2/README.md /tmp/sam2build/
COPY sam2/sam2/ /tmp/sam2build/sam2/
RUN pip install --no-cache-dir -e /tmp/sam2build

# Install service dependencies
RUN pip install --no-cache-dir \
    flask \
    flask-cors \
    requests \
    Pillow \
    opencv-python-headless

RUN mkdir -p ${APP_ROOT}/checkpoints

COPY sam2-service/app.py /app/app.py
WORKDIR /app

CMD ["python", "app.py"]
