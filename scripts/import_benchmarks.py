import csv
import json
import os

def import_csv_to_json(csv_path, json_path):
    """
    Importa um arquivo CSV estruturado e o converte para o JSON de Benchmarks SG.
    O CSV deve ter as colunas: handicap_level, lie_type, dist_yards, avg_strokes
    Exemplo: handicap_10, fairway, 100, 2.85
    """
    if not os.path.exists(csv_path):
        print(f"Erro: O arquivo CSV {csv_path} não foi encontrado.")
        return

    benchmark_data = {}

    with open(csv_path, mode='r', encoding='utf-8') as file:
        reader = csv.DictReader(file)
        for row in reader:
            hcp = row['handicap_level'].strip().lower()
            lie = row['lie_type'].strip().lower()
            dist = int(row['dist_yards'].strip())
            avg = float(row['avg_strokes'].strip())

            if hcp not in benchmark_data:
                benchmark_data[hcp] = {}
            if lie not in benchmark_data[hcp]:
                benchmark_data[hcp][lie] = []

            benchmark_data[hcp][lie].append({
                "dist_yards": dist,
                "avg_strokes_to_hole": avg
            })

    # Ordenar por distância
    for hcp in benchmark_data:
        for lie in benchmark_data[hcp]:
            benchmark_data[hcp][lie].sort(key=lambda x: x['dist_yards'])

    output_data = {"benchmark_data": benchmark_data}

    with open(json_path, mode='w', encoding='utf-8') as json_file:
        json.dump(output_data, json_file, indent=2)
    
    print(f"Sucesso! JSON gerado em: {json_path}")

if __name__ == "__main__":
    import_csv_to_json("benchmarks.csv", "sg_benchmarks.json")
