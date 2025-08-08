#!/usr/bin/env python3
"""Test script to check Azure OpenAI deployment availability."""

import asyncio
import json
from openai import AsyncAzureOpenAI
from dotenv import load_dotenv
import os

# Load environment variables
load_dotenv("config/.env")

async def test_azure_deployments():
    """Test different deployment names with Azure OpenAI."""
    
    api_key = os.getenv('AZURE_OPENAI_API_KEY')
    endpoint = os.getenv('AZURE_OPENAI_ENDPOINT')
    api_version = os.getenv('AZURE_OPENAI_API_VERSION', '2024-06-01')
    
    print(f"API Key: {'***' + api_key[-4:] if api_key else 'NOT SET'}")
    print(f"Endpoint: {endpoint}")
    print(f"API Version: {api_version}")
    print("-" * 50)
    
    if not api_key or not endpoint:
        print("❌ Azure OpenAI configuration missing!")
        return
    
    client = AsyncAzureOpenAI(
        api_key=api_key,
        azure_endpoint=endpoint,
        api_version=api_version
    )
    
    # Common deployment names to test
    deployment_names = [
        "gpt-4o",
        "gpt-4",
        "gpt-4-turbo", 
        "gpt-4-32k",
        "gpt-35-turbo",
        "gpt-35-turbo-16k",
        "text-davinci-003"
    ]
    
    for deployment in deployment_names:
        try:
            print(f"Testing deployment: {deployment}")
            
            response = await client.chat.completions.create(
                model=deployment,
                messages=[{"role": "user", "content": "Hello"}]
            )
            
            print(f"✅ {deployment} - WORKS! Response: {response.choices[0].message.content.strip()}")
            
        except Exception as e:
            error_msg = str(e)
            if "404" in error_msg or "NotFound" in error_msg:
                print(f"❌ {deployment} - NOT FOUND (404)")
            elif "401" in error_msg or "Unauthorized" in error_msg:
                print(f"❌ {deployment} - UNAUTHORIZED (401)")
            elif "403" in error_msg or "Forbidden" in error_msg:
                print(f"❌ {deployment} - FORBIDDEN (403)")
            else:
                print(f"❌ {deployment} - ERROR: {error_msg}")

if __name__ == "__main__":
    asyncio.run(test_azure_deployments())
