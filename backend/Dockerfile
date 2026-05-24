# Use an official slim Python image
FROM python:3.11-slim

# Set the working directory inside the container
WORKDIR /app

# Copy requirements first (Docker caches this layer — 
# if requirements don't change, it won't reinstall packages)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application code
COPY . .

# Cloud Run injects the PORT environment variable (usually 8080)
# We read it here, defaulting to 8080
ENV PORT=8080

# Run the FastAPI app using uvicorn
# --host 0.0.0.0 means accept connections from any IP
# Cloud Run routes traffic to this port
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]