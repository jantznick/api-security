FROM python:3.12-slim

WORKDIR /workspace/demo/acme/commerce-api

COPY demo/acme/commerce-api/requirements.txt .
COPY connectors/python /workspace/connectors/python
RUN pip install --no-cache-dir -r requirements.txt

COPY demo/acme/commerce-api/main.py .

ENV PORT=4012
EXPOSE 4012

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-4012}"]
