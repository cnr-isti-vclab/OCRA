# Renders RTI assets and orchestrates the segmentation; every SAM2 inference
# goes to the sam2 service, so this image needs no torch.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1

RUN pip install --no-cache-dir numpy scipy Pillow requests flask flask-cors gunicorn

WORKDIR /app
COPY *.py ./
RUN mkdir -p /app/derived

# A segmentation is one long request; the service runs its passes in sequence.
CMD ["gunicorn", "--bind", "0.0.0.0:5004", "--threads", "4", "--timeout", "600", "app:app"]
