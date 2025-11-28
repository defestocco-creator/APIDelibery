# teste_corrigido.py
import requests
import time

# Ignorar SSL em desenvolvimento
requests.packages.urllib3.disable_warnings()

def teste_corrigido():
    base_url = "https://apidelibery.onrender.com"
    
    print("🔧 TESTE CORRIGIDO - MÉTRICAS POR USUÁRIO")
    print("=" * 50)
    
    # 1. Health Check
    print("1. 🔍 Health Check...")
    try:
        response = requests.get(f"{base_url}/", verify=False, timeout=10)
        print(f"   ✅ API: {response.json().get('api')}")
    except Exception as e:
        print(f"   ❌ Erro: {e}")
        return
    
    # 2. Login
    print("\n2. 🔐 Login...")
    try:
        login = requests.post(
            f"{base_url}/login",
            json={"email": "teste@delibery.com", "password": "senha123"},
            verify=False,
            timeout=15
        )
        
        if login.status_code == 200:
            data = login.json()
            token = data["token"]
            user_id = data["clientId"]
            
            print(f"   ✅ Login OK")
            print(f"   👤 User ID: {user_id}")
            print(f"   📝 {data.get('message')}")
            
            headers = {"Authorization": f"Bearer {token}"}
            
            # 3. Debug - Verificar usuário
            print("\n3. 🐛 Debug usuário...")
            debug = requests.get(f"{base_url}/debug-user", headers=headers, verify=False)
            if debug.status_code == 200:
                debug_data = debug.json()
                print(f"   📁 Collection: {debug_data.get('collectionName')}")
                print(f"   📊 Métricas na collection: {debug_data.get('metricsCount')}")
            
            # 4. Fazer algumas ações para gerar métricas
            print("\n4. 🚀 Gerando métricas...")
            
            # Criar pedido
            print("   📦 Criando pedido...")
            pedido_resp = requests.post(
                f"{base_url}/pedido",
                json={
                    "cliente": "Cliente Teste Métricas",
                    "valor_total": 99.99,
                    "endereco": {"rua": "Rua Teste", "numero": "123"}
                },
                headers=headers,
                verify=False
            )
            print(f"      Status: {pedido_resp.status_code}")
            
            time.sleep(1)
            
            # Listar pedidos
            print("   📋 Listando pedidos...")
            pedidos_resp = requests.get(f"{base_url}/pedidos", headers=headers, verify=False)
            print(f"      Status: {pedidos_resp.status_code}")
            
            time.sleep(1)
            
            # 5. Ver métricas
            print("\n5. 📊 Verificando métricas...")
            metricas_resp = requests.get(f"{base_url}/metricas", headers=headers, verify=False)
            
            if metricas_resp.status_code == 200:
                metricas = metricas_resp.json()
                print(f"   ✅ Minhas métricas: {len(metricas)}")
                
                if metricas:
                    print(f"\n   📈 ÚLTIMAS MÉTRICAS:")
                    for i, m in enumerate(metricas[:5]):
                        print(f"   {i+1}. {m.get('method')} {m.get('endpoint')}")
                        print(f"       Status: {m.get('status')} | Tempo: {m.get('timeMs')}ms")
                        print(f"       UserId: {m.get('userId')}")
                else:
                    print("   ❌ NENHUMA MÉTRICA ENCONTRADA!")
            else:
                print(f"   ❌ Erro nas métricas: {metricas_resp.status_code}")
                print(f"   📄 {metricas_resp.text}")
                
        else:
            print(f"   ❌ Login falhou: {login.status_code}")
            print(f"   📄 {login.text}")
            
    except Exception as e:
        print(f"   ❌ Erro: {e}")

if __name__ == "__main__":
    teste_corrigido()
