import requests

token = 'KGAT_0f12d3a4d07d48f7775e36f82bbc41b6'
headers = {
    'Authorization': f'Bearer {token}'
}
r = requests.get(
    'https://www.kaggle.com/api/v1/kernels/list',
    headers=headers,
    params={'page': 1, 'pageSize': 1}
)
print("Status:", r.status_code)
try:
    print("Response JSON keys:", r.json()[0].keys() if isinstance(r.json(), list) else r.json().keys())
    print("First item ref:", r.json()[0].get('ref') if isinstance(r.json(), list) else 'No list')
except Exception as e:
    print("Parse error or no JSON:", e)
